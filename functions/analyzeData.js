const { getDataUsingS3, ChatMessageManager } = require("../utils/utils.js");

module.exports.default = async (event) => {
  try {
    const res = await getDataUsingS3(
      process.env.jsonBucket,
      process.env.jsonFile
    );
    const s3Data = JSON.parse(res);
    const ChatManager = new ChatMessageManager(s3Data);
    const messagesResponse = await ChatManager.batchSaveMessages();

    return {
      status: 200,
      ok: true,
      messagesResponse,
    };
  } catch (err) {
    console.log(err);
    return {
      status: 500,
      ok: false,
      error: err,
    };
  }
};
