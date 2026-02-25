const pMap = require('p-map');

const { createPlaywrightBrowser, disposePlaywrightBrowser } = require('./runPlaywright');
const runCompareScenario = require('./runCompareScenario');

const logger = require('./logger')('liveCompare');
const {
  loadConfigJSON,
  applyScenarioFilter,
  decorateConfigCommon,
  buildScenarioViews,
  getAsyncCaptureLimit,
  writeCompareConfigFile,
  flatMapTestPairs
} = require('./createBitmapsHelper');

function decorateConfigForCompare (config) {
  const configJSON = loadConfigJSON(config);
  const totalScenarioCount = configJSON.scenarios.length;

  decorateConfigCommon(config, configJSON);

  configJSON.isReference = false;
  configJSON.isCompare = true;

  // Pass through compare-specific config
  configJSON.compareRetries = config.compareRetries;
  configJSON.compareRetryDelay = config.compareRetryDelay;
  configJSON.maxNumDiffPixels = config.maxNumDiffPixels;

  applyScenarioFilter(configJSON, config.args.filter);

  // Validate that all scenarios have referenceUrl
  const missingReferenceUrl = configJSON.scenarios.filter(function (s) { return !s.referenceUrl; });
  if (missingReferenceUrl.length > 0) {
    const labels = missingReferenceUrl.map(function (s) { return '"' + s.label + '"'; }).join(', ');
    throw new Error('liveCompare requires referenceUrl for all scenarios. Missing on: ' + labels);
  }

  logger.log('Selected ' + configJSON.scenarios.length + ' of ' + totalScenarioCount + ' scenarios.');
  return configJSON;
}

function delegateCompareScenarios (config) {
  const scenarioViews = buildScenarioViews(config);
  const asyncCaptureLimit = getAsyncCaptureLimit(config);

  if (config.engine.startsWith('puppet')) {
    return pMap(scenarioViews, runCompareScenario.puppet, { concurrency: asyncCaptureLimit });
  } else if (config.engine.startsWith('play')) {
    return new Promise(function (resolve, reject) {
      createPlaywrightBrowser(config).then(function (browser) {
        console.log('Browser created');

        for (let i = 0; i < scenarioViews.length; i++) {
          scenarioViews[i]._playwrightBrowser = browser;
        }

        pMap(scenarioViews, runCompareScenario.playwright, { concurrency: asyncCaptureLimit }).then(function (out) {
          disposePlaywrightBrowser(browser).then(function () { resolve(out); });
        }, function (e) {
          disposePlaywrightBrowser(browser).then(function () { reject(e); });
        });
      }, function (e) { reject(e); });
    });
  } else {
    logger.error('Engine "' + ((typeof config.engine === 'string' && config.engine) || 'undefined') + '" not recognized!');
  }
}

module.exports = function (config) {
  const promise = delegateCompareScenarios(decorateConfigForCompare(config))
    .then(function (rawTestPairs) {
      const result = {
        compareConfig: {
          testPairs: flatMapTestPairs(rawTestPairs)
        }
      };
      return writeCompareConfigFile(config.tempCompareConfigFileName, result);
    });

  return promise;
};
