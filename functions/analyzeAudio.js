const { transcribeAudioFromS3 } = require("../utils/utils.js");

module.exports.default = async (event) => {
  try {
    const res = await transcribeAudioFromS3(
      `https://${process.env.audioInputBucket}.s3.amazonaws.com/${process.env.audioFile}`,
      process.env.transcriptionJobName,
      process.env.audioOutputBucket
    );
    // Log for Debugging in Cloudwatch
    console.log("TRANSCRIBE RESULTS: ", JSON.stringify(res));
    return {
      ok: true,
      transcribeResults: res,
    };
  } catch (err) {
    console.log("TRANSCRIBE ERROR: ", JSON.stringify(err));
    return {
      ok: false,
      err,
    };
  }
};
