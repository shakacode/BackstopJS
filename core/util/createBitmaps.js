const cloneDeep = require('lodash/cloneDeep');
const pMap = require('p-map');

const runPuppet = require('./runPuppet');
const { createPlaywrightBrowser, runPlaywright, disposePlaywrightBrowser } = require('./runPlaywright');

const logger = require('./logger')('createBitmaps');
const {
  loadConfigJSON,
  applyScenarioFilter,
  decorateConfigCommon,
  buildScenarioViews,
  getAsyncCaptureLimit,
  writeCompareConfigFile,
  flatMapTestPairs
} = require('./createBitmapsHelper');

function decorateConfigForCapture (config, isReference) {
  const configJSON = loadConfigJSON(config);
  const totalScenarioCount = configJSON.scenarios.length;

  decorateConfigCommon(config, configJSON);

  configJSON.isReference = isReference;

  applyScenarioFilter(configJSON, config.args.filter);

  logger.log('Selected ' + configJSON.scenarios.length + ' of ' + totalScenarioCount + ' scenarios.');
  return configJSON;
}

function delegateScenarios (config) {
  const scenarioViews = buildScenarioViews(config);
  const asyncCaptureLimit = getAsyncCaptureLimit(config);

  if (config.engine.startsWith('puppet')) {
    return pMap(scenarioViews, runPuppet, { concurrency: asyncCaptureLimit });
  } else if (config.engine.startsWith('play')) {
    return new Promise((resolve, reject) => {
      createPlaywrightBrowser(config).then(browser => {
        console.log('Browser created');

        for (const view of scenarioViews) {
          view._playwrightBrowser = browser;
        }

        pMap(scenarioViews, runPlaywright, { concurrency: asyncCaptureLimit }).then(out => {
          disposePlaywrightBrowser(browser).then(() => resolve(out));
        }, e => {
          disposePlaywrightBrowser(browser).then(() => reject(e));
        });
      }, e => reject(e));
    });
  } else if (/chrom./i.test(config.engine)) {
    logger.error('Chromy is no longer supported in version 5+. Please use version 4.x.x for chromy support.');
  } else {
    logger.error(`Engine "${(typeof config.engine === 'string' && config.engine) || 'undefined'}" not recognized! If you require PhantomJS or Slimer support please use backstopjs@3.8.8 or earlier.`);
  }
}

module.exports = function (config, isReference) {
  const promise = delegateScenarios(decorateConfigForCapture(config, isReference))
    .then(rawTestPairs => {
      const result = {
        compareConfig: {
          testPairs: flatMapTestPairs(rawTestPairs)
        }
      };
      return writeCompareConfigFile(config.tempCompareConfigFileName, result);
    });

  return promise;
};
