"use strict";
const {
  AnalyzeDataFunction,
  AnalyzeAudioFunction,
  SaveAudioFunction,
} = require("./functions");

module.exports.analyzeData = AnalyzeDataFunction;
module.exports.analyzeAudio = AnalyzeAudioFunction;
module.exports.saveAudio = SaveAudioFunction;
