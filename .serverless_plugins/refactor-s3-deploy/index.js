"use strict";

// Many thanks to https://github.com/funkybob/serverless-s3-deploy for all of the deployment code in this plugin was extracted from his plugin.  

const glob = require("glob-all");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const BbPromise = require("bluebird");

const globOpts = {
  nodir: true,
};

var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({
  region: "us-east-1",
});

class Assets {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = this.serverless.getProvider("aws");

    let config = this.serverless.service.custom.assets;
    if (Array.isArray(config)) {
      config = {
        targets: config,
      };
    }

    this.config = Object.assign({}, {
        auto: false,
        verbose: false,
        resolveReferences: true,
        targets: [],
      },
      config
    );

    this.hooks = {
      "after:deploy:deploy": () =>
        Promise.resolve().then(this.afterDeploy.bind(this)),
    };
  }

  /*
   * Handy method for logging (when `verbose` is set)
   * Also log on the default serverless SLS_DEBUG env
   */
  log(message) {
    if (this.options.verbose || process.env.SLS_DEBUG || this.config.verbose) {
      this.serverless.cli.log(message);
    }
  }

  afterDeploy() {
    if (this.config.auto) {
      return this.deployS3().then(() => this.invokeDataAnalysisAfterS3Deploy());
    }
  }

  listStackResources(resources, nextToken) {
    resources = resources || [];
    if (!this.config.resolveReferences) {
      return BbPromise.resolve(resources);
    }
    return this.provider
      .request("CloudFormation", "listStackResources", {
        StackName: this.provider.naming.getStackName(),
        NextToken: nextToken,
      })
      .then((response) => {
        resources.push.apply(resources, response.StackResourceSummaries);
        if (response.NextToken) {
          // Query next page
          return this.listStackResources(resources, response.NextToken);
        }
      })
      .return(resources);
  }

  resolveBucket(resources, value) {
    if (typeof value === "string") {
      return BbPromise.resolve(value);
    } else if (value && value.Ref) {
      let resolved;
      resources.forEach((resource) => {
        if (resource && resource.LogicalResourceId === value.Ref) {
          resolved = resource.PhysicalResourceId;
        }
      });

      if (!resolved) {
        this.serverless.cli.log(
          `WARNING: Failed to resolve reference ${value.Ref}`
        );
      }
      return BbPromise.resolve(resolved);
    } else {
      return BbPromise.reject(new Error(`Invalid bucket name ${value}`));
    }
  }

  emptyBucket(bucket, dir) {
    const listParams = {
      Bucket: bucket,
      Prefix: dir,
    };

    return this.provider
      .request("S3", "listObjectsV2", listParams)
      .then((listedObjects) => {
        if (listedObjects.Contents.length === 0) return;

        const deleteParams = {
          Bucket: bucket,
          Delete: {
            Objects: [],
          },
        };

        listedObjects.Contents.forEach(({
          Key
        }) => {
          deleteParams.Delete.Objects.push({
            Key,
          });
        });
        return this.provider
          .request("S3", "deleteObjects", deleteParams)
          .then(() => {
            if (listedObjects.Contents.IsTruncated) {
              this.log(`Is not finished. Rerun emptyBucket`);
              return this.emptyBucket(bucket, dir);
            }
          });
      });
  }

  deployS3() {
    let assetSets = this.config.targets;

    // Read existing stack resources so we can resolve references if necessary
    return this.listStackResources().then((resources) => {
      // Process asset sets in parallel (up to 3)
      return BbPromise.map(
        assetSets,
        (assets) => {
          const prefix = assets.prefix || "";
          // Try to resolve the bucket name
          return this.resolveBucket(resources, assets.bucket)
            .then((bucket) => {
              if (this.options.bucket && this.options.bucket !== bucket) {
                this.log(`Skipping bucket: ${bucket}`);
                return Promise.resolve("");
              }

              if (assets.empty) {
                this.log(`Emptying bucket: ${bucket}`);
                return this.emptyBucket(bucket, prefix).then(() => bucket);
              }
              return Promise.resolve(bucket);
            })
            .then((bucket) => {
              if (!bucket) {
                return;
              }

              // Process files serially to not overload the network
              return BbPromise.each(assets.files, (opt) => {
                this.log(`Sync bucket: ${bucket}:${prefix}`);
                this.log(`Path: ${opt.source}`);

                const cfg = Object.assign({}, globOpts, {
                  cwd: opt.source,
                });
                const filenames = glob.sync(opt.globs, cfg);
                return BbPromise.each(filenames, (filename) => {
                  const body = fs.readFileSync(path.join(opt.source, filename));
                  const type =
                    mime.lookup(filename) ||
                    opt.defaultContentType ||
                    "application/octet-stream";

                  this.log(`\tFile:  ${filename} (${type})`);

                  // when using windows path join resolves to backslashes, but s3 is expecting a slash
                  // therefore replace all backslashes with slashes
                  const key = path.join(prefix, filename).replace(/\\/g, "/");

                  const details = Object.assign({
                      ACL: assets.acl || "private",
                      Body: body,
                      Bucket: bucket,
                      Key: key,
                      ContentType: type,
                    },
                    opt.headers || {}
                  );

                  return this.provider.request("S3", "putObject", details);
                });
              });
            });
        }, {
          concurrency: 3,
        }
      );
    });
  }
  invokeDataAnalysisAfterS3Deploy = async () => {
    this.log(
      `Invoking data analysis function for sentiment analysis and transcription of audio`
    );
    const sentRes = await this.invokeSentimentAnalysis();
    const transRes = await this.invokeTranscriptionPipeline();

    if (sentRes.StatusCode === 200) {
      this.log("Sentiment Analysis Results:");
      JSON.parse(sentRes.Payload).messagesResponse.forEach((message) => {
        if (message.ok) {
          this.log(
            `OK: GUID: ${message.data} | SENTIMENT: ${message.sentiment}`
          );
        } else {
          this.log(`Error in message analysis, check Cloudwatch`);
        }
      });
    } else {
      this.log(
        "Error is Sentiment Analysis Invocation logic.  Check Cloudwatch"
      );
    }
    if (transRes.StatusCode === 200) {
      this.log(
        JSON.stringify(JSON.parse(transRes.Payload).transcribeResults),
        null,
        4
      );
      this.log("Check Dynamo Transcription table for results once finished");
    } else {
      this.log(JSON.parse(transRes.Payload).err);
    }
  };
  invokeSentimentAnalysis = () => {
    this.log(`Invoking Sentiment Analysis...`);
    return new Promise((resolve, reject) => {
      var params = {
        FunctionName: this.serverless.service.custom.analyzeDataLambda,
      };
      lambda.invoke(params, (err, data) => {
        if (err) {
          this.log(`There was an error during invocation: ${err.stack}`);
          reject(err);
        } else {
          this.log(`Successful invocation of sentiment analysis.`);
          resolve(data);
        }
      });
    });
  };
  invokeTranscriptionPipeline = () => {
    this.log(`Invoking Trancription of Audio...`);
    return new Promise((resolve, reject) => {
      var params = {
        FunctionName: this.serverless.service.custom.transcribeAudioLambda,
      };
      lambda.invoke(params, (err, data) => {
        if (err) {
          this.log(`There was an error during invocation: ${err.stack}`);
          reject(err);
        } else {
          this.log(`Successful invocation of transcription pipeline.`);
          resolve(data);
        }
      });
    });
  };
}

module.exports = Assets;