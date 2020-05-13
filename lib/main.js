"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const moment = require("moment");
const child_process = __importStar(require("child_process"));
const refsTagsPrefix = "refs/tags/";
function isNullOrWhitespace(input) {
    if (typeof input === 'undefined' || input == null) {
        return true;
    }
    return input.replace(/\s/g, '').length < 1;
}
function find_commit_sha(path) {
    return __awaiter(this, void 0, void 0, function* () {
        let output = "";
        const options = {
            cwd: path,
            listeners: {
                stdline: (data) => output += data,
            }
        };
        yield exec_1.exec("git", ["rev-parse", "--short", `HEAD`], options);
        return output.trim();
    });
}
function validatePlatform() {
    if (os.platform() !== "linux") {
        core.setFailed("Unsupported operating system - this action only runs on Linux");
        return false;
    }
    return true;
}
function readAndValidateConfig() {
    const config = {
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
function dockerLogin(config) {
    const command = `docker login -u ${config.username} --password-stdin ${config.registry}`;
    try {
        child_process.execSync(command, { input: config.password });
    }
    catch (error) {
        core.setFailed(error.message);
        throw error;
    }
}
function run() {
    return __awaiter(this, void 0, void 0, function* () {
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
                const commitSHA = yield find_commit_sha(path.dirname(config.dockerfile));
                snapshotId = `${snapshotDate}-${commitSHA}`;
                buildParams.push("-t", `${config.repository}:${snapshotId}`);
            }
            for (const tag of effectiveAdditionalTags) {
                buildParams.push("-t", `${config.repository}:${tag}`);
            }
            for (const arg of config.buildArgs) {
                buildParams.push("--build-arg", `${arg}`);
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
            yield exec_1.exec("docker", buildParams, dockerOptions);
            if (config.tagLatest) {
                core.info(`Pushing '${config.repository}:latest' to registry...`);
                yield exec_1.exec("docker", ["push", `${config.repository}:latest`]);
            }
            if (config.tagSnapshot) {
                core.info(`Pushing '${config.repository}:${snapshotId}' to registry...`);
                yield exec_1.exec("docker", ["push", `${config.repository}:${snapshotId}`]);
            }
            for (const tag of effectiveAdditionalTags) {
                yield exec_1.exec("docker", ["push", `${config.repository}:${tag}`]);
            }
        }
        catch (error) {
            core.setFailed(error.message);
        }
    });
}
run();
