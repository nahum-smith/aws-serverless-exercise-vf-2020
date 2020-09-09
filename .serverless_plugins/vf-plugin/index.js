var AWS = require("aws-sdk");
var lambda = new AWS.Lambda({
  region: "us-east-1",
});

class Deploy {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.commands = {
      deploy: {
        lifecycleEvents: ["resources", "functions", "deploy"],
      },
    };
    this.hooks = {
      "after:deploy:deploy": this.afterDeploy,
    };
  }
  afterDeploy = (serverless) => {
    var params = {
      FunctionName: "voice-foundry-testing-dev-hello",
    };
    lambda.invoke(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else console.log(data);
    });
  };
}

module.exports = Deploy;
