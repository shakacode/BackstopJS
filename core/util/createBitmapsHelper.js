const cloneDeep = require('lodash/cloneDeep');
const _ = require('lodash');
const fs = require('./fs');
const ensureDirectoryPath = require('./ensureDirectoryPath');

function regexTest (string, search) {
  const re = new RegExp(search);
  return re.test(string);
}

function ensureViewportLabel (config) {
  if (typeof config.viewports === 'object') {
    config.viewports.forEach(function (viewport) {
      if (!viewport.label) {
        viewport.label = viewport.name;
      }
    });
  }
}

function pad (number) {
  let r = String(number);
  if (r.length === 1) {
    r = '0' + r;
  }
  return r;
}

function generateScreenshotDateTime (configJSON) {
  const screenshotNow = new Date();
  let screenshotDateTime = screenshotNow.getFullYear() + pad(screenshotNow.getMonth() + 1) + pad(screenshotNow.getDate()) + '-' + pad(screenshotNow.getHours()) + pad(screenshotNow.getMinutes()) + pad(screenshotNow.getSeconds());
  return configJSON.dynamicTestId ? configJSON.dynamicTestId : screenshotDateTime;
}

function loadConfigJSON (config) {
  let configJSON;
  if (typeof config.args.config === 'object') {
    configJSON = config.args.config;
  } else {
    configJSON = Object.assign({}, require(config.backstopConfigFileName));
  }
  configJSON.scenarios = configJSON.scenarios || [];
  ensureViewportLabel(configJSON);
  return configJSON;
}

function applyScenarioFilter (configJSON, filterArg) {
  if (filterArg) {
    const scenarios = [];
    filterArg.split(',').forEach(function (filteredTest) {
      configJSON.scenarios.forEach(function (scenario) {
        if (regexTest(scenario.label, filteredTest)) {
          scenarios.push(scenario);
        }
      });
    });
    configJSON.scenarios = scenarios;
  }
}

function decorateConfigCommon (config, configJSON) {
  const screenshotDateTime = generateScreenshotDateTime(configJSON);
  configJSON.screenshotDateTime = screenshotDateTime;
  config.screenshotDateTime = screenshotDateTime;

  if (configJSON.dynamicTestId) {
    console.log('dynamicTestId \'' + configJSON.dynamicTestId + '\' found. BackstopJS will run in dynamic-test mode.');
  }

  configJSON.env = cloneDeep(config);
  configJSON.paths.tempCompareConfigFileName = config.tempCompareConfigFileName;
  configJSON.defaultMisMatchThreshold = config.defaultMisMatchThreshold;
  configJSON.backstopConfigFileName = config.backstopConfigFileName;
  configJSON.defaultRequireSameDimensions = config.defaultRequireSameDimensions;

  return configJSON;
}

function saveViewportIndexes (viewport, index) {
  return Object.assign({}, viewport, { vIndex: index });
}

function buildScenarioViews (config) {
  const scenarios = [];
  const scenarioViews = [];

  config.viewports = config.viewports.map(saveViewportIndexes);

  config.scenarios.forEach(function (scenario, i) {
    scenario.sIndex = i;
    scenario.selectors = scenario.selectors || [];
    if (scenario.viewports) {
      scenario.viewports = scenario.viewports.map(saveViewportIndexes);
    }
    scenarios.push(scenario);

    if (!config.isReference && _.has(scenario, 'variants')) {
      scenario.variants.forEach(function (variant) {
        variant._parent = scenario;
        scenarios.push(scenario);
      });
    }
  });

  let scenarioViewId = 0;
  scenarios.forEach(function (scenario) {
    let desiredViewportsForScenario = config.viewports;

    if (scenario.viewports && scenario.viewports.length > 0) {
      desiredViewportsForScenario = scenario.viewports;
    }

    desiredViewportsForScenario.forEach(function (viewport) {
      scenarioViews.push({
        scenario,
        viewport,
        config,
        id: scenarioViewId++
      });
    });
  });

  return scenarioViews;
}

function getAsyncCaptureLimit (config) {
  return config.asyncCaptureLimit === 0 ? 1 : config.asyncCaptureLimit || 10;
}

function writeCompareConfigFile (comparePairsFileName, compareConfig) {
  const compareConfigJSON = JSON.stringify(compareConfig, null, 2);
  ensureDirectoryPath(comparePairsFileName);
  return fs.writeFile(comparePairsFileName, compareConfigJSON);
}

function flatMapTestPairs (rawTestPairs) {
  return rawTestPairs.reduce(function (acc, result) {
    let testPairs = result.testPairs;
    if (!testPairs) {
      testPairs = {
        diff: {
          isSameDimensions: '',
          dimensionDifference: { width: '', height: '' },
          misMatchPercentage: ''
        },
        reference: '',
        test: '',
        selector: '',
        fileName: '',
        label: '',
        scenario: result.scenario,
        viewport: result.viewport,
        msg: result.msg,
        error: result.originalError && result.originalError.name
      };
    }
    return acc.concat(testPairs);
  }, []);
}

module.exports = {
  regexTest,
  ensureViewportLabel,
  generateScreenshotDateTime,
  loadConfigJSON,
  applyScenarioFilter,
  decorateConfigCommon,
  saveViewportIndexes,
  buildScenarioViews,
  getAsyncCaptureLimit,
  writeCompareConfigFile,
  flatMapTestPairs
};
