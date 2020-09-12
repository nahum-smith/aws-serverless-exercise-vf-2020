const { getDataUsingS3, AudioManager } = require("../utils/utils.js");

module.exports.default = async (event) => {
  try {
    const {
      s3: {
        bucket: { name: bucket },
        object: { key },
      },
      eventTime,
    } = event.Records[0];
    const res = await getDataUsingS3(bucket, key);
    const TranscribeManager = new AudioManager(JSON.parse(res), eventTime);
    const dynamoRes = await TranscribeManager.saveResultsToDynamo();

    // Log for results CloudWatch
    console.log(dynamoRes);
    return dynamoRes;
  } catch (err) {
    console.log(err);
    return {
      ok: false,
      err: err,
    };
  }
};
