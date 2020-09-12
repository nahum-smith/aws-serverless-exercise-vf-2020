"use strict";
const AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");

module.exports.analyzeData = async (event) => {
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

module.exports.analyzeAudio = async (event) => {
  try {
    const res = await transcribeAudioFromS3();
    console.log(res);
    return {
      status: 200,
      ok: true,
      data: JSON.stringify(res, null, 4),
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

module.exports.saveAudio = async (event) => {
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

class AudioManager {
  db = new AWS.DynamoDB({
    region: "us-east-1",
    apiVersion: "2012-08-10",
  });
  params = {
    Item: {
      guid: {
        S: null,
      },
      jobName: {
        S: null,
      },
      transcript: {
        S: null,
      },
      timestamp: {
        S: null,
      },
    },
    ReturnConsumedCapacity: "TOTAL",
    TableName: process.env.transcriptionTable,
  };
  data = null;
  constructor(transcribeInput, timestamp) {
    this.data = transcribeInput;
    this.setParams(timestamp);
  }
  setParams(timestamp) {
    this.params.Item.guid.S = uuidv1();
    this.params.Item.jobName.S = this.data.jobName;
    this.params.Item.transcript.S = this.data.results.transcripts[0].transcript;
    this.params.Item.timestamp.S = timestamp;
  }
  saveResultsToDynamo() {
    return new Promise((resolve, reject) => {
      this.db.putItem(this.params, (err, data) => {
        if (err)
          reject({
            ok: false,
            jobName: this.data.jobName,
            error: err,
            message: "Transcription results not saved",
          });
        else
          resolve({
            ok: true,
            jobName: this.data.jobName,
            guid: this.params.Item.guid.S,
            data: data,
            message: "Transcription Saved",
          });
      });
    });
  }
}
class ChatMessageManager {
  constructor(input) {
    this.comprehend = new AWS.Comprehend({
      region: "us-east-1",
      apiVersion: "2017-11-27",
    });
    this.db = new AWS.DynamoDB({
      region: "us-east-1",
      apiVersion: "2012-08-10",
    });
    this.messages = input;
  }
  async detectSentiment(message) {
    var params = {
      LanguageCode: "en",
      Text: message,
    };
    return new Promise((resolve, reject) => {
      this.comprehend.detectSentiment(params, function (err, data) {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  async batchSaveMessages() {
    return Promise.all(
      this.messages.map(async (item) => {
        const sentimentRes = await this.detectSentiment(item.message);
        return new Promise((resolve, reject) => {
          var params = {
            Item: {
              uid: {
                S: item.uid,
              },
              name: {
                S: item.name,
              },
              type: {
                S: item.type,
              },
              message: {
                S: item.message,
              },
              timestamp: {
                S: item.timestamp,
              },
              sentiment: {
                S: sentimentRes.Sentiment,
              },
              positiveValue: {
                N: sentimentRes.SentimentScore.Positive.toString(),
              },
              negativeScore: {
                N: sentimentRes.SentimentScore.Negative.toString(),
              },
              neutralScore: {
                N: sentimentRes.SentimentScore.Neutral.toString(),
              },
              mixedScore: {
                N: sentimentRes.SentimentScore.Mixed.toString(),
              },
            },
            ReturnConsumedCapacity: "TOTAL",
            TableName: process.env.sentimentTable,
          };
          this.db.putItem(params, function (err, data) {
            if (err)
              reject({
                ok: false,
                data: item,
                error: err,
                message: "Message not saved",
              });
            else
              resolve({
                ok: true,
                data: item.uid,
                sentiment: sentimentRes.Sentiment,
                message: "Message Saved",
              });
          });
        });
      })
    );
  }
}

const getDataUsingS3 = async (bucket, key) => {
  const s3 = new AWS.S3({
    region: "us-east-1",
    apiVersion: "2006-03-01",
  });
  const params = {
    Bucket: bucket,
    Key: key,
    ResponseContentType: "application/json",
  };
  return new Promise((resolve, reject) => {
    try {
      s3.getObject(params, function (err, data) {
        if (err) {
          reject(err);
        }
        resolve(data.Body.toString());
      });
    } catch (err) {
      reject(err);
    }
  });
};
const transcribeAudioFromS3 = async () => {
  var transcribeservice = new AWS.TranscribeService({
    region: "us-east-1",
    apiVersion: "2017-10-26",
  });
  var params = {
    LanguageCode: "en-US",
    Media: {
      MediaFileUri: `https://${process.env.audioInputBucket}.s3.amazonaws.com/${process.env.audioFile}`,
    },
    TranscriptionJobName: process.env.transcriptionJobName,
    MediaFormat: "mp4",
    OutputBucketName: process.env.audioOutputBucket,
  };
  return new Promise((resolve, reject) => {
    transcribeservice.startTranscriptionJob(params, function (err, data) {
      if (err) reject(err);
      else resolve(data); // successful response
    });
  });
};
