var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({
  region: "us-east-1",
});

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.commands = {
      deploy: {
        lifecycleEvents: ["deploy"],
      },
    };
    this.hooks = {
      "after:deploy:deploy": () => Promise.resolve().then(this.logDeployDone.bind(this)),
    };
  }
  logDeployDone() {
    console.log('deploy finished son')
  }
  afterDeploy = () => {
    var params = {
      FunctionName: this.serverless.service.custom.analyzeDataLambda
    };
    lambda.invoke(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    });
  };
}

module.exports = Deploy;