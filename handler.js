'use strict';
var AWS = require('aws-sdk')


module.exports.hello = async event => {
  return {
    statusCode: 200,
    body: JSON.stringify({
        message: 'Go Serverless v1.0! Your function executed successfully!',
        input: event,
      },
      null,
      2
    ),
  };
};

module.exports.analyzeData = async event => {
  try {
    const res = await getDataUsingS3();
    const s3Data = JSON.parse(res)
    const ChatManager = new ChatMessageManager(s3Data)
    const saveMessageResponse = await ChatManager.batchSaveMessages();
    return {
      status: 200,
      ok: true,
      data: JSON.stringify(saveMessageResponse, null, 4)
    }
  } catch (err) {
    console.log(err)
    return {
      status: 500,
      ok: false,
      error: err
    }
  }
}


class ChatMessageManager {
  constructor(input) {
    this.comprehend = new AWS.Comprehend({
      region: 'us-east-1',
      apiVersion: '2017-11-27'
    });
    this.db = new AWS.DynamoDB({
      region: 'us-east-1',
      apiVersion: '2012-08-10'
    });
    this.messages = input
  }
  async detectSentiment(message) {
    var params = {
      LanguageCode: 'en',
      Text: message
    };
    return new Promise((resolve, reject) => {
      this.comprehend.detectSentiment(params, function (err, data) {
        if (err) reject(err)
        else resolve(data)
      });
    })
  }

  async batchSaveMessages() {
    return Promise.all(this.messages.map(async item => {
      const sentimentRes = await this.detectSentiment(item.message)
      return new Promise((resolve, reject) => {
        var params = {
          Item: {
            "uid": {
              S: item.uid
            },
            "name": {
              S: item.name
            },
            "type": {
              S: item.type
            },
            "message": {
              S: item.message
            },
            "timestamp": {
              S: item.timestamp
            },
            "sentiment": {
              S: sentimentRes.Sentiment
            },
            "positiveValue": {
              N: sentimentRes.SentimentScore.Positive.toString()
            },
            "negativeScore": {
              N: sentimentRes.SentimentScore.Negative.toString()
            },
            "neutralScore": {
              N: sentimentRes.SentimentScore.Neutral.toString()
            },
            "mixedScore": {
              N: sentimentRes.SentimentScore.Mixed.toString()
            }
          },
          ReturnConsumedCapacity: "TOTAL",
          TableName: "ChatSentimentTable"
        }
        this.db.putItem(params, function (err, data) {
          if (err) reject({
            ok: false,
            data: item,
            error: err,
            message: 'Message not saved'
          })
          else resolve({
            ok: true,
            data: item.uid,
            sentiment: sentimentRes.Sentiment,
            message: 'Message Saved'
          })
        });
      })
    }))
  }
}

const getDataUsingS3 = async () => {
  const s3 = new AWS.S3({
    region: 'us-east-1',
    apiVersion: '2006-03-01'
  });
  const params = {
    Bucket: 'vf-sample-data',
    Key: 'sample-data.json',
    ResponseContentType: 'application/json'
  };
  return new Promise((resolve, reject) => {
    s3.getObject(params, function (err, data) {
      if (err) {
        reject(err)
      }
      resolve(data.Body.toString())
    });
  })
}