"use strict";
const {
  AnalyzeDataFunction,
  AnalyzeAudioFunction,
  SaveAudioFunction,
} = require("./functions");

console.log(AnalyzeDataFunction, AnalyzeAudioFunction, SaveAudioFunction);
module.exports.analyzeData = AnalyzeDataFunction;
module.exports.analyzeAudio = AnalyzeAudioFunction;
module.exports.saveAudio = SaveAudioFunction;
