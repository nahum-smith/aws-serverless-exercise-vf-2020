const {
    v1: uuidv1
} = require("uuid");

const fs = require('fs')

const data = require("./sample-data.json");
data.forEach(item => {
    const time = new Date()
    delete item.id
    item.uid = uuidv1()
    time.setMinutes(time.getMinutes() + 2)
    item.timestamp = time.toISOString()
})
const fileData = JSON.stringify(data)
console.log(fileData)
fs.writeFileSync('./sample-data.json', fileData)