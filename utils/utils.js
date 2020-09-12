const AWS = require("aws-sdk");
const { v1: uuidv1 } = require("uuid");

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
    console.log(
      "Instantiating Audio Manager Class: ",
      JSON.stringify({
        transcribeInput,
        timestamp,
      })
    );
    this.data = transcribeInput;
    this.setParams(timestamp);
  }
  setParams(timestamp) {
    this.params.Item.guid.S = uuidv1();
    this.params.Item.jobName.S = this.data.jobName;
    this.params.Item.transcript.S = this.data.results.transcripts[0].transcript;
    this.params.Item.timestamp.S = timestamp;
    console.log("Audio Manager params set: ", JSON.stringify(this.params));
  }
  saveResultsToDynamo() {
    return new Promise((resolve, reject) => {
      try {
        console.log("Audio manager persisting results to dynamo ...");
        this.db.putItem(this.params, (err, data) => {
          if (err) {
            console.log("Error saving to dynamo: ", JSON.stringify(err));
            reject({
              ok: false,
              jobName: this.data.jobName,
              error: err,
              message: "Transcription results not saved",
            });
          } else {
            console.log("Successfully saved: ", JSON.stringify(data));
            resolve({
              ok: true,
              jobName: this.data.jobName,
              guid: this.params.Item.guid.S,
              data: data,
              message: "Transcription Saved",
            });
          }
        });
      } catch (err) {
        console.log("Error saving to dynamo: ", JSON.stringify(err));
        reject(err);
      }
    });
  }
}
class ChatMessageManager {
  constructor(input) {
    console.log("Instantiating ChatMessageManager: ", JSON.stringify(input));
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
    console.log("ChatMessageManager detecting sentiment on: ", message);
    return new Promise((resolve, reject) => {
      try {
        this.comprehend.detectSentiment(params, function (err, data) {
          if (err) {
            console.log(
              "Error during detect sentiment request: ",
              JSON.stringify(err)
            );
            reject(err);
          } else {
            console.log("Sentiment request success: ", JSON.stringify(data));
            resolve(data);
          }
        });
      } catch (err) {
        console.log(
          "Error during detect sentiment request: ",
          JSON.stringify(err)
        );
      }
    });
  }

  async batchSaveMessages() {
    console.log("Batch analyzing messages ...");
    return Promise.all(
      this.messages.map(async (item) => {
          return new Promise((resolve, reject) => {
              try {
                const sentimentRes = await this.detectSentiment(item.message);
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
                  console.log(
                    "Saving sentiment results to dynamo: ",
                    JSON.stringify(params)
                  );
                  this.db.putItem(params, function (err, data) {
                    if (err) {
                      console.log("Error saving to dynamo: ", JSON.stringify(err));
                      reject({
                        ok: false,
                        data: item,
                        error: err,
                        message: "Message not saved",
                      });
                    } else {
                      resolve({
                        ok: true,
                        data: item.uid,
                        sentiment: sentimentRes.Sentiment,
                        message: "Message Saved",
                      });
                    }
                  });
              }
              catch(err) {
                  console.log('Error: ', JSON.stringify(err))
                  reject(err)
              }
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
  console.log("Fetching ", params);
  return new Promise((resolve, reject) => {
    try {
      s3.getObject(params, function (err, data) {
        if (err) {
          reject(err);
        }
        console.log("Fetch Success: ", JSON.stringify(data));
        if (!!data.Body) {
          resolve(data.Body.toString());
        } else {
          throw new Error("No sample data uploaded to S3");
        }
      });
    } catch (err) {
      console.log("Error fetching: ", JSON.stringify(err));
      reject(err);
    }
  });
};
const transcribeAudioFromS3 = async (mediaURL, jobName, outputBucket) => {
  var transcribeservice = new AWS.TranscribeService({
    region: "us-east-1",
    apiVersion: "2017-10-26",
  });
  var params = {
    LanguageCode: "en-US",
    Media: {
      MediaFileUri: mediaURL,
    },
    TranscriptionJobName: jobName,
    MediaFormat: "mp4",
    OutputBucketName: outputBucket,
  };
  console.log("Sending transcription request: ", JSON.stringify(params));
  return new Promise((resolve, reject) => {
    try {
      transcribeservice.startTranscriptionJob(params, function (err, data) {
        if (err) {
          console.log("Error on transcription request: ", JSON.stringify(err));
          reject(err);
        } else {
          console.log("Transcription response: ", JSON.stringify(data));
          resolve(data);
        }
      });
    } catch (err) {
      console.log("Error on transcription request: ", JSON.stringify(err));
      reject(err);
    }
  });
};

module.exports = {
  AudioManager,
  ChatMessageManager,
  getDataUsingS3,
  transcribeAudioFromS3,
};
