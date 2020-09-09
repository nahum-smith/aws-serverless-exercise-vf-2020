var AWS = require('aws-sdk')

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
                console.log(err)
                reject(err)
            }
            console.log('Success');
            resolve(data.Body.toString())
        });
    })
}

async function run() {
    try {
        const res = await getDataUsingS3()
        console.log(res)
    } catch (err) {
        console.log(err)
    }
}

run()