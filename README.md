# AWS | Serverless Framework Exercise | 2020-09-12

### General Exercise Requirements

Build a serverless framework (serverless.com) deployment that creates a Lambda, an S3 bucket, and a Dynamo DB table and uploads a file to your bucket. Then, write a plugin that invokes the Lambda after the deployment, extracts data from the file in S3 and inserts that data into DynamoDB. Be creative. Show off. Make it interesting.

### Summary of Implementation

This implementation took the approach of auto uploading two files to S3 with a serverless plugin after the deployment hook is called.

1. a JSON file representing an example of a chat conversation between a customer, customer-service rep, and a manager broken up into a list of individual messages.
2. a small mp4 audio file.

Immediately following this upload, an general invocation function is called which invokes two lambdas

    1. Data Analyzer- responsible for pulling and parsing JSON data from JSON S3 bucket.  It then loops through each individual message and uses the AWS Comprehend SDK to analyze the sentiment of the messages.  The message data + the sentiment analysis is then stored to a DynamoDB table.
    2. Audio Analyzer- responsible for starting a transcription job with the AWS Transcribe SDK using the details of the audio file stored in the audio S3 bucket.

A third lambda listens for the results of the transcription call being saved in a transcription results S3 bucket

    3. Audio Persister- responsible for listening to events on the transcription results bucket, pulling and parsing result data when new objects are stored, then persisting the transcription results in a DynmoDB table.

### My Approach

My initial approach was to use two plugins, one 3rd party (https://www.serverless.com/plugins/serverless-s3-deploy) for the auto upload functionality, and then create a custom plugin that calls the invocation function. This worked initially, but soon I began getting directory errors in the final stages of the deployment cleanup. I assume I was not using the lifecycle hooks correctly. In order to get the overall program working for a first iteration I decided, while not ideal, a solution extracting the needed code from the S3 deploy plugin and adding it to my own custom code would solve the lifecycle problems. This new hybrid plugin is named `refactor-s3-deploy` which subsequently calls a dual lambda invocation function immediately following the deployment logic used in `serverless-s3-deploy`. (This plugin is a local plugin to the project and does not need to be installed.)

So I give thanks to:
(https://github.com/funkybob/serverless-s3-deploy) for the s3 deployment implementation.

There are lots of things I would change for a second iteration.
