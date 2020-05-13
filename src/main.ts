import * as core from "@actions/core";
import {exec} from "@actions/exec";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import moment = require("moment");
import * as child_process from "child_process";

const refsTagsPrefix = "refs/tags/";

interface Config {
    dockerfile: string,
    buildkit: boolean,
    repository: string,
    username: string,
    password: string,
    registry: string,
    tagLatest: boolean,
    tagSnapshot: boolean,
    additionalTags: string[],
    buildArgs: string[],
    stripRefsTags: boolean
}

function isNullOrWhitespace(input: string) {
    if (typeof input === 'undefined' || input == null) {
        return true;
    }

    return input.replace(/\s/g, '').length < 1;
}

async function find_commit_sha(path: string): Promise<string> {
    let output = "";
    const options = {
        cwd: path,
        listeners: {
            stdline: (data) => output += data,
        }
    };

    await exec("git", ["rev-parse", "--short", `HEAD`], options);

    return output.trim();
}

function validatePlatform(): boolean {
    if (os.platform() !== "linux") {
        core.setFailed("Unsupported operating system - this action only runs on Linux");
        return false;
    }

    return true;
}

function readAndValidateConfig(): Config | undefined {
    const config: Config = {
        dockerfile: core.getInput("dockerfile"),
        buildkit: core.getInput("buildkit") == "true",
        repository: core.getInput("repository"),
        registry: core.getInput("registry"),
        username: core.getInput("username"),
        password: core.getInput("password"),
        tagLatest: core.getInput("tag-latest") == "true",
        tagSnapshot: core.getInput("tag-snapshot") == "true",
        additionalTags: core.getInput("additional-tags")
            .split(",")
            .map(x => x.trim())
            .filter(x => !isNullOrWhitespace(x)),
        buildArgs: core.getInput("build-args")
            .split(",")
            .map(x => x.trim())
            .filter(x => !isNullOrWhitespace(x)),
        stripRefsTags: core.getInput("strip-refs-tags") != "false",
    };

    if (config.repository == "") {
        core.setFailed("Repository is required.");
        return;
    }

    if (config.username == "") {
        core.setFailed("Username is required.");
        return;
    }

    if (config.password == "") {
        core.setFailed("Password is required.");
        return;
    }

    if (!fs.existsSync(config.dockerfile)) {
        core.setFailed(`The specified Dockerfile (${config.dockerfile}) does not exist.`);
        return;
    }

    if (!config.tagLatest && !config.tagSnapshot && config.additionalTags.length == 0) {
        core.setFailed(`One of tag-snapshot, tag-latest or additional-tags must be set.`);
        return;
    }

    return config;
}

function dockerLogin(config: Config) {
    const command = `docker login -u ${config.username} --password-stdin ${config.registry}`;
    try {
        child_process.execSync(command, {input: config.password});
    } catch (error) {
        core.setFailed(error.message);
        throw error;
    }
}

async function run() {
    try {
        if (!validatePlatform()) {
            return;
        }

        const config = readAndValidateConfig();
        if (config == undefined) {
            return;
        }

        let effectiveAdditionalTags = config.additionalTags;
        if (config.stripRefsTags) {
            effectiveAdditionalTags = config.additionalTags.map(val => {
                if (!val.startsWith(refsTagsPrefix)) {
                    return val;
                }

                return val.substr(refsTagsPrefix.length);
            });
        }

        core.info("Logging into Docker registry");
        dockerLogin(config);

        core.info("Constructing `docker build` command line");
        let buildParams = ["build", "-f", path.basename(config.dockerfile)];
        if (config.tagLatest) {
            buildParams.push("-t", `${config.repository}:latest`);
        }

        let snapshotId = "";
        if (config.tagSnapshot) {
            const snapshotDate = moment().format("YYYYMMDD-HHMMSS");
            const commitSHA = await find_commit_sha(path.dirname(config.dockerfile));
            snapshotId = `${snapshotDate}-${commitSHA}`;

            buildParams.push("-t", `${config.repository}:${snapshotId}`);
        }

        for (const tag of effectiveAdditionalTags) {
            buildParams.push("-t", `${config.repository}:${tag}`);
        }

        for (const arg of config.buildArgs) {
            buildParams.push("--build-arg", `${arg}`)
        }

        const env = {};
        if (config.buildkit) {
            env["DOCKER_BUILDKIT"] = "true";
        }

        core.info("Building Docker Image...");
        buildParams.push(".");
        const dockerOptions = {
            cwd: path.dirname(config.dockerfile),
            env: env,
        };
        await exec("docker", buildParams, dockerOptions);

        if (config.tagLatest) {
            core.info(`Pushing '${config.repository}:latest' to registry...`);
            await exec("docker", ["push", `${config.repository}:latest`]);
        }

        if (config.tagSnapshot) {
            core.info(`Pushing '${config.repository}:${snapshotId}' to registry...`);
            await exec("docker", ["push", `${config.repository}:${snapshotId}`]);
        }

        for (const tag of effectiveAdditionalTags) {
            await exec("docker", ["push", `${config.repository}:${tag}`]);
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
