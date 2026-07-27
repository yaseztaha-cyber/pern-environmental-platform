import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type Locale = 'en' | 'ar';

/** Simple interpolation: t('key', 'fallback', { name: 'World' }) → replaces {name} in the string */
export type Interpolation = Record<string, string | number>;

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string, params?: Interpolation) => string;
  dir: 'ltr' | 'rtl';
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const STORAGE_KEY = 'pern_locale';

/* ─── translation dictionaries ─── */

const en: Record<string, string> = {
  // Nav sections
  'nav.overview': 'Overview',
  'nav.monitoring': 'Monitoring',
  'nav.intelligence': 'Intelligence',
  'nav.automation': 'Automation',
  'nav.system': 'System',
  'nav.more': 'More',

  // Nav items
  'nav.dashboard': 'Dashboard',
  'nav.liveSensors': 'Live Sensors',
  'nav.devices': 'Devices',
  'nav.connectDevice': 'Connect Device',
  'nav.setupGuide': 'Setup Guide',
  'nav.history': 'History',
  'nav.map': 'Map',
  'nav.aiEngine': 'AI Engine',
  'nav.predictions': 'Predictions',
  'nav.analytics': 'Analytics',
  'nav.aiAssistant': 'AI Assistant',
  'nav.alerts': 'Alerts',
  'nav.rules': 'Rules',
  'nav.aiRuleGen': 'AI Rule Gen',
  'nav.settings': 'Settings',
  'nav.status': 'Status',
  'nav.protocols': 'Protocols',
  'nav.connectionTest': 'Connection Test',
  'nav.deviceLifecycle': 'Device Lifecycle',
  'nav.deviceHealth': 'Device Health',
  'nav.realSensorMap': 'Real Sensor Map',
  'nav.reports': 'Reports',
  'nav.weather': 'Weather',
  'nav.compliance': 'Compliance',
  'nav.vulnerableGroups': 'Vulnerable Groups',
  'nav.digitalTwin': 'Digital Twin',
  'nav.dataValidation': 'Data Validation',
  'nav.virtualCompare': 'Virtual Compare',
  'nav.calibration': 'Calibration',
  'nav.research': 'Research',
  'nav.knowledge': 'Knowledge',
  'nav.resources': 'Resources',
  'nav.firmware': 'Firmware',
  'nav.support': 'Support',
  'nav.security': 'Security',
  'nav.organization': 'Organization',
  'nav.team': 'Team',
  'nav.showcase': 'Showcase',

  // Header
  'header.platform': 'Pollution & Environmental Risk Navigator',
  'header.signIn': 'Sign in',
  'header.signOut': 'Sign out',

  // Common
  'common.loading': 'Loading…',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.back': 'Back',
  'common.refresh': 'Refresh',
  'common.export': 'Export',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.noData': 'No data available',
  'common.confirm': 'Confirm',
  'common.close': 'Close',

  // Dashboard
  'dashboard.title': 'Dashboard',
  'dashboard.welcome': 'Welcome to PERN',
  'dashboard.subtitle': 'Environmental Intelligence Platform',

  // Alerts
  'alerts.title': 'Alerts',
  'alerts.noAlerts': 'No alerts',
  'alerts.acknowledged': 'Acknowledged',

  // Devices
  'devices.title': 'Devices',
  'devices.register': 'Register Device',

  // Auth
  'auth.welcomeBack': 'Welcome back',
  'auth.signInSubtitle': 'Sign in to the Environmental Intelligence Platform',
  'auth.logto': 'Sign in with Logto',
  'auth.logtoNotConfigured': 'Logto not configured',
  'auth.demoAccount': 'Continue with Demo Account',
  'auth.checking': 'Checking session…',
  'auth.verifying': 'Verifying your authentication.',
  'auth.processing': 'Processing login…',
  'auth.loginSuccess': 'Login successful! Redirecting…',
  'auth.loginFailed': 'Login failed. Please try again.',
  'auth.notConfigured': 'Logto is not configured. Set VITE_LOGTO_ENDPOINT and VITE_LOGTO_APP_ID, or use the Demo Account.',
  'auth.unavailable': 'Could not reach the OIDC provider. Use the Demo Account below.',

  // Footer
  'footer.institution': 'STEM Gharbiya 2026',
  'footer.platform': 'Environmental Intelligence Platform',

  // Dashboard
  'dashboard.ehi.category.excellent': 'Excellent',
  'dashboard.ehi.category.good': 'Good',
  'dashboard.ehi.category.moderate': 'Moderate',
  'dashboard.ehi.category.poor': 'Poor',
  'dashboard.ehi.category.critical': 'Critical',
  'dashboard.title.page': 'Environmental Dashboard',
  'dashboard.subtitle.page': 'Real-time overview',
  'dashboard.alert.mqttUnavailable': 'MQTT broker not available. Please ensure the backend is running.',
  'dashboard.mode.live': 'LIVE MODE',
  'dashboard.mode.simulation': 'SIMULATION MODE',
  'dashboard.mode.realMqtt': '(Real MQTT)',
  'dashboard.tooltip.disabledInLive': 'Disabled in Live Mode',
  'dashboard.tooltip.simulateReadings': 'Simulate new sensor readings',
  'dashboard.button.simulateUpdate': 'Simulate Update',
  'dashboard.switchingMode': 'Switching to {mode} Mode...',
  'dashboard.ehi.label': 'ENVIRONMENTAL HEALTH INDEX',
  'dashboard.lastUpdated': 'Last updated',
  'dashboard.subIndices': '6 Sub-indices',
  'dashboard.subIndexList': 'Air \u2022 Water \u2022 Human Safety \u2022 Ecosystem \u2022 Sustainability \u2022 Stability',
  'dashboard.button.viewAiAnalysis': 'View Full AI Analysis',
  'dashboard.stat.airQualityIndex': 'Air Quality Index',
  'dashboard.stat.waterQualityIndex': 'Water Quality Index',
  'dashboard.stat.activeAlerts': 'Active Alerts',
  'dashboard.stat.connectedDevices': 'Connected Devices',
  'dashboard.chart.ehiTrendTitle': 'EHI Trend (Last 8 Hours)',
  'dashboard.chart.trendSuffix': 'trend',
  'dashboard.button.viewAnalytics': 'View Full Analytics',
  'dashboard.section.virtualSensors': 'Virtual Sensors (Soft Sensors)',
  'dashboard.button.viewAll': 'VIEW ALL',
  'dashboard.section.livePhysicalSensors': 'Live Physical Sensors',
  'dashboard.section.topVirtualSensors': 'Top Virtual Sensors',
  'dashboard.button.viewAllArrow': 'View All \u2192',
  'dashboard.confidenceSuffix': 'confidence',

  // Sensors
  'sensors.title': 'Live Sensor Monitoring',
  'sensors.subtitle': '13 physical sensors + 10 virtual soft sensors',
  'sensors.badge.liveFromMqtt': 'LIVE FROM MQTT',
  'sensors.badge.simulationMode': 'SIMULATION MODE',
  'sensors.toast.csvExportSuccess': 'CSV exported successfully!',
  'sensors.button.exportCsv': 'Export CSV',
  'sensors.toast.excelExportSuccess': 'Excel file downloaded!',
  'sensors.button.exportExcel': 'Export Excel',
  'sensors.section.physicalSensors': 'Physical Sensors (13)',
  'sensors.badge.safe': 'SAFE',
  'sensors.section.virtualSensors': 'Virtual Sensors (Soft Sensors)',
  'sensors.badge.computed': 'COMPUTED',
  'sensors.label.confidence': 'Confidence',
  'sensors.inputsUsedSuffix': '{count} inputs used',
  'sensors.missingPrefix': 'Missing: ',

  // Alerts
  'alerts.subtitle': 'Real-time alerts with root cause detection',
  'alerts.placeholder.search': 'Search alerts...',
  'alerts.filter.allLevels': 'All Levels',
  'alerts.filter.high': 'High',
  'alerts.filter.medium': 'Medium',
  'alerts.emptyState.noResults': 'No alerts match your search.',
  'alerts.button.acknowledge': 'Acknowledge',
  'alerts.status.acknowledged': 'Acknowledged',

  // Device Connection
  'deviceConnection.title': 'Device Connection Manager',
  'deviceConnection.subtitle': 'Real MQTT + Virtual Sensor Compatibility',
  'deviceConnection.label.brokerUrl': 'MQTT Broker WebSocket URL',
  'deviceConnection.button.connect': 'Connect',
  'deviceConnection.button.disconnect': 'Disconnect',
  'deviceConnection.label.status': 'Status: ',
  'deviceConnection.section.virtualCompatibility': 'Virtual Sensors Compatibility',
  'deviceConnection.description.basedOnConnected': 'Based on currently connected physical sensors',
  'deviceConnection.label.requires': 'Requires: ',
  'deviceConnection.status.available': 'Available',
  'deviceConnection.label.confidence': 'Confidence: ',
  'deviceConnection.status.missingRequired': 'Missing required sensors',

  // Settings
  'settings.title': 'Settings',
  'settings.subtitle': 'Platform configuration, notifications, and integrations',
  'settings.section.userRole': 'User Role (Demo)',
  'settings.role.description': 'Current role affects visible features in demo.',
  'settings.section.pushNotifications': 'Push Notifications (ntfy.sh)',
  'settings.label.notificationTopic': 'Notification Topic',
  'settings.button.save': 'Save',
  'settings.label.subscribe': 'Subscribe: ',
  'settings.button.sendTestNotification': 'Send Test Notification',
  'settings.section.mqttIot': 'MQTT & IoT',
  'settings.label.broker': 'Broker: ',
  'settings.label.topics': 'Topics: ',
  'settings.status.connectedWhenLive': 'Status: Connected when Live Mode is active',
  'settings.section.authentication': 'Authentication (Logto OIDC)',
  'settings.auth.description': 'OIDC integration with Logto is planned. Currently using demo mode.',
  'settings.toast.topicSaved': 'Topic saved successfully!',
  'settings.toast.sendingTest': 'Sending test notification...',
  'settings.toast.testSuccess': 'Test notification sent! Check your ntfy app.',
  'settings.toast.testFailed': 'Failed to send notification',

  // Settings — Appearance
  'settings.section.appearance': 'Appearance',
  'settings.label.theme': 'Theme',
  'settings.theme.dark': 'Dark',
  'settings.theme.light': 'Light',
  'settings.theme.system': 'System',
  'settings.label.compactMode': 'Compact Mode',
  'settings.label.animations': 'Animations',

  // Settings — Data Preferences
  'settings.section.dataPreferences': 'Data Preferences',
  'settings.label.refreshInterval': 'Refresh Interval',
  'settings.refresh.10s': '10 seconds',
  'settings.refresh.30s': '30 seconds',
  'settings.refresh.60s': '1 minute',
  'settings.refresh.300s': '5 minutes',
  'settings.label.chartType': 'Default Chart Type',
  'settings.chart.line': 'Line',
  'settings.chart.bar': 'Bar',
  'settings.chart.area': 'Area',
  'settings.label.maxDataPoints': 'Max Data Points',
  'settings.label.dataRetention': 'Data Retention',

  // Settings — Alert Preferences
  'settings.section.alertPreferences': 'Alert Preferences',
  'settings.label.alertCooldown': 'Alert Cooldown',
  'settings.cooldown.30s': '30 seconds',
  'settings.cooldown.60s': '1 minute',
  'settings.cooldown.300s': '5 minutes',
  'settings.cooldown.600s': '10 minutes',
  'settings.label.soundAlerts': 'Sound Alerts',
  'settings.label.autoAcknowledge': 'Auto-Acknowledge',

  // Settings — System Info
  'settings.section.systemInfo': 'System Information',
  'settings.label.version': 'Version',
  'settings.label.uptime': 'Uptime',
  'settings.label.dbStatus': 'Database',
  'settings.label.apiStatus': 'API',
  'settings.label.mqttStatus': 'MQTT',
  'settings.status.healthy': 'Healthy',
  'settings.status.degraded': 'Degraded',
  'settings.status.down': 'Down',

  // Map
  'map.title': 'Environmental Map',
  'map.subtitle': '12 Governorates \u2022 Live sensor data \u2022 Interactive map',
  'map.section.governoratesOverview': 'Governorates Overview',
  'map.detailViewSuffix': ' \u2014 Detailed View',
  'map.label.ehiScore': 'EHI Score: ',
  'map.label.pm25': 'PM2.5: ',
  'map.label.status': 'Status: ',
  'common.status.good': 'Good',
  'common.status.moderate': 'Moderate',
  'common.status.excellent': 'Excellent',

  // AI Engine
  'ai.title': 'AI Engine',
  'ai.subtitle': '3-level analysis \u2022 Root cause \u2022 Confidence scoring',
  'ai.level.simple.name': 'Simple',
  'ai.level.simple.description': 'Human-readable condition summary',
  'ai.level.scientific.name': 'Scientific',
  'ai.level.scientific.description': 'WHO/EPA/Egypt standard references',
  'ai.level.expert.name': 'Expert',
  'ai.level.expert.description': 'Aerosol physics, water chemistry, meteorology',
  'ai.analyzingPrefix': '\u2022 Analyzing: ',
  'ai.section.scientificEhi': 'Scientific Environmental Health Index (WHO + EPA Aligned)',
  'ai.label.statisticalConfidence': 'Statistical Confidence',
  'ai.label.weight': 'Weight: ',
  'ai.levelPrefix': 'Level ',
  'ai.badge.active': 'Active',

  // Predictions
  'predictions.title': 'AI Predictions',
  'predictions.subtitle': '24h / 48h / 7d forecasts with confidence intervals',
  'predictions.horizon.24h': '24 Hours',
  'predictions.horizon.48h': '48 Hours',
  'predictions.horizon.7d': '7 Days',
  'predictions.label.confidence': 'Confidence',
  'predictions.label.uncertainty': 'Uncertainty: \u00b1',
  'predictions.method.ensemble': 'Ensemble: Linear Trend + Moving Average + Weather-informed',
  'predictions.label.currentEhi': 'Current EHI: ',
  'predictions.summary.stable': 'Models predict stable to slightly improving conditions over the next week.',
  'predictions.badge.realData': 'Using Real Device Data',
  'predictions.badge.estimatedData': 'Using Estimated Data',
  'predictions.accuracy.title': 'Prediction Accuracy (Last 5 Tests)',
  'predictions.label.averageError': 'Average Error',
  'predictions.label.accuracyScore': 'Accuracy Score',
  'predictions.label.testsRun': 'Tests Run',

  // Analytics
  'analytics.title': 'Advanced Analytics',
  'analytics.subtitle': 'Trends \u2022 Radar \u2022 Distribution \u2022 Correlations',
  'analytics.chart.ehiTrendTitle': 'Environmental Health Index Trend (12h)',
  'analytics.chart.virtualSensorProfile': 'Virtual Sensor Profile',
  'analytics.chart.airWaterCorrelation': 'Air Quality vs Water Quality Correlation',
  'analytics.chart.line.airQuality': 'Air Quality',
  'analytics.chart.line.waterQuality': 'Water Quality',

  // Automation
  'automation.title': 'Automation Engine',
  'automation.subtitle': 'Real ntfy.sh push notifications + device control',
  'automation.ntfy.testTitle': 'PERN Automation Test',
  'automation.ntfy.testMessage': 'Test notification from automation engine. Current EHI: {ehi}',
  'automation.toast.testSent': 'Test notification sent!',
  'automation.toast.testFailed': 'Failed to send notification',
  'automation.button.sendTestNotification': 'Send Test ntfy Notification',
  'automation.label.ntfyTopic': 'ntfy.sh Topic',
  'automation.button.saveTopic': 'Save Topic',
  'automation.section.activeRules': 'Active Automation Rules (Ordered Execution)',
  'automation.status.enabled': 'ENABLED',
  'automation.status.disabled': 'DISABLED',
  'automation.section.actuatorStatus': 'Real Actuator Status',
  'automation.badge.live': 'LIVE',
  'automation.emptyState.noActuatorCommands': 'No actuator commands sent yet. Rules will update this section when triggered.',
  'automation.label.lastChanged': 'Last changed: ',
  'automation.section.executionLog': 'Execution Log + Real Actuator Commands',
  'automation.emptyState.logPlaceholder': 'Rules evaluated every 8s. Real MQTT actuator commands are sent when conditions met.',
};

const ar: Record<string, string> = {
  // Nav sections
  'nav.overview': '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629',
  'nav.monitoring': '\u0627\u0644\u0645\u0631\u0627\u0642\u0628\u0629',
  'nav.intelligence': '\u0627\u0644\u0630\u0643\u0627\u0621',
  'nav.automation': '\u0627\u0644\u0623\u062a\u0645\u062a\u0639',
  'nav.system': '\u0627\u0644\u0646\u0638\u0627\u0645',
  'nav.more': '\u0645\u0632\u064a\u062f',

  // Nav items
  'nav.dashboard': '\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',
  'nav.liveSensors': '\u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629',
  'nav.devices': '\u0627\u0644\u0623\u062c\u0647\u0632\u0629',
  'nav.connectDevice': '\u062a\u0635\u0644 \u0628\u062c\u0647\u0627\u0632\u0629',
  'nav.setupGuide': '\u062f\u0644\u064a\u0644 \u0627\u0644\u062a\u062b\u0628\u064a\u062a',
  'nav.history': '\u0627\u0644\u062a\u0627\u0631\u064a\u062e',
  'nav.map': '\u0627\u0644\u062e\u0631\u064a\u0637\u0629',
  'nav.aiEngine': '\u0645\u062d\u0631\u0631 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a',
  'nav.predictions': '\u0627\u0644\u062a\u0648\u0628\u064a\u0646\u0627\u062a',
  'nav.analytics': '\u0627\u0644\u062a\u062d\u0644\u064a\u0644\u0627\u062a',
  'nav.aiAssistant': '\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a',
  'nav.alerts': '\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a',
  'nav.rules': '\u0627\u0644\u0642\u0648\u0627\u0639\u062f',
  'nav.aiRuleGen': '\u0645\u0648\u0644\u062f \u0642\u0648\u0627\u0639\u062f \u0627\u0644\u0630\u0643\u0627\u0621',
  'nav.settings': '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a',
  'nav.status': '\u0627\u0644\u062d\u0627\u0644\u0629',
  'nav.protocols': '\u0627\u0644\u0628\u0631\u0627\u062a\u0648\u0643\u0648\u0644\u0627\u062a',
  'nav.connectionTest': '\u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0627\u062a\u0635\u0627\u0644',
  'nav.deviceLifecycle': '\u062f\u0639\u0631\u0629 \u0627\u0644\u062c\u0647\u0627\u0632\u0629',
  'nav.deviceHealth': '\u0635\u062d\u0629 \u0627\u0644\u062c\u0647\u0627\u0632\u0629',
  'nav.realSensorMap': '\u062e\u0631\u064a\u0637\u0629 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629',
  'nav.reports': '\u0627\u0644\u062a\u0642\u0627\u0631\u064a\u0631',
  'nav.weather': '\u0627\u0644\u0637\u0642\u0633',
  'nav.compliance': '\u0627\u0644\u0627\u0645\u062a\u062b\u0627\u0644',
  'nav.vulnerableGroups': '\u0645\u062c\u0645\u0648\u0639\u0627\u062a \u0647\u0634\u064e\u0627\u0641\u0629',
  'nav.digitalTwin': '\u0627\u0644\u062a\u0648\u0623\u0645\u0629 \u0627\u0644\u0631\u0642\u0645\u064a\u0629',
  'nav.dataValidation': '\u062a\u062d\u0642\u0642 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
  'nav.virtualCompare': '\u0645\u0642\u0627\u0631\u0646\u0629 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a',
  'nav.calibration': '\u0627\u0644\u0645\u0639\u0627\u064a\u0646\u0629',
  'nav.research': '\u0627\u0644\u0628\u062d\u062b',
  'nav.knowledge': '\u0627\u0644\u0645\u0639\u0631\u0641\u0629',
  'nav.resources': '\u0627\u0644\u0645\u0648\u0627\u0631\u062f',
  'nav.firmware': '\u0627\u0644\u0628\u0631\u0645\u062c\u064a\u0627\u062a',
  'nav.support': '\u0627\u0644\u062f\u0639\u0645',
  'nav.security': '\u0627\u0644\u0623\u0645\u0627\u0646',
  'nav.organization': '\u0627\u0644\u0645\u0646\u0638\u0645\u0629',
  'nav.team': '\u0627\u0644\u0641\u0631\u064a\u0642',
  'nav.showcase': '\u0639\u0631\u0636 \u0627\u0644\u0645\u0646\u062a\u062c',

  // Header
  'header.platform': '\u0645\u0634\u062e\u0635 \u0627\u0644\u062a\u0644\u0648\u062b \u0627\u0644\u0628\u064a\u0626\u064a \u0648\u0645\u062e\u0627\u0637\u0631 \u0627\u0644\u0628\u064a\u0626\u0629',
  'header.signIn': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644',
  'header.signOut': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c',

  // Common
  'common.loading': '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644…',
  'common.save': '\u062d\u0641\u0638',
  'common.cancel': '\u0625\u0644\u063a\u0627\u0621',
  'common.delete': '\u062d\u0630\u0641',
  'common.edit': '\u062a\u0639\u062f\u064a\u0644',
  'common.add': '\u0625\u0636\u0627\u0641\u0629',
  'common.back': '\u0631\u062c\u0648\u0639',
  'common.refresh': '\u062a\u062d\u062f\u064a\u062b',
  'common.export': '\u062a\u0635\u062f\u064a\u0631',
  'common.search': '\u0628\u062d\u062b',
  'common.filter': '\u062a\u0635\u0641\u064a\u0629',
  'common.noData': '\u0644\u0627 \u062a\u0648\u062c\u062f \u0628\u064a\u0627\u0646\u0627\u062a',
  'common.confirm': '\u062a\u0623\u0643\u064a\u062f',
  'common.close': '\u0625\u063a\u0644\u0627\u0642',

  // Dashboard
  'dashboard.title': '\u0644\u0648\u062d\u0629 \u0627\u0644\u062a\u062d\u0643\u0645',
  'dashboard.welcome': '\u0645\u0631\u062d\u0628\u064b\u0627 \u0628\u0643 \u0641\u064a PERN',
  'dashboard.subtitle': '\u0645\u0646\u0635\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0628\u064a\u0626\u064a',

  // Alerts
  'alerts.title': '\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a',
  'alerts.noAlerts': '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a',
  'alerts.acknowledged': '\u062a\u0645 \u0625\u0630\u0639\u0627\u0632\u0647\u0627',

  // Devices
  'devices.title': '\u0627\u0644\u0623\u062c\u0647\u0632\u0629',
  'devices.register': '\u062a\u0633\u062c\u064a\u0644 \u062c\u0647\u0627\u0632\u0629',

  // Auth
  'auth.welcomeBack': '\u0645\u0631\u062d\u0628\u064b\u0627 \u0628\u0643',
  'auth.signInSubtitle': '\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0625\u0644\u0649 \u0645\u0646\u0635\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0628\u064a\u0626\u064a',
  'auth.logto': '\u062a\u0633\u062c\u064a\u0644 \u0628\u0627\u0633\u062a\u062e\u062f\u0627\u0645 Logto',
  'auth.logtoNotConfigured': '\u0644\u0645 \u064a\u062a\u0645 \u0625\u0639\u062f\u0627\u062f Logto',
  'auth.demoAccount': '\u0645\u062a\u0627\u0628\u0639\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a',
  'auth.checking': '\u062c\u0627\u0631\u064a \u0627\u0644\u062c\u0644\u0633\u0629…',
  'auth.verifying': '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0645\u0635\u0631\u0641\u064a\u0629.',
  'auth.processing': '\u062c\u0627\u0631\u064a \u0645\u0639\u0627\u0644\u062c\u0629 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644…',
  'auth.loginSuccess': '\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0628\u0646\u062c\u0627\u062d! \u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0645\u0648\u064a\u0644…',
  'auth.loginFailed': '\u0641\u0634\u0644 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629.',
  'auth.notConfigured': '\u0644\u0645 \u064a\u062a\u0645 \u0625\u0639\u062f\u0627\u062f Logto. \u062d\u062f\u062f VITE_LOGTO_ENDPOINT \u0648 VITE_LOGTO_APP_ID \u0623\u0648 \u0627\u0633\u062a\u062e\u062f\u0645 \u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u062c\u0631\u064a\u0628.',
  'auth.unavailable': '\u0644\u0645 \u064a\u062a\u0645\u06a9\u0646 \u0627\u0644\u0648\u0635\u0644 \u0628\u0645\u062e\u062f\u0645 \u0627\u0644\u0645\u0635\u0631\u0641. \u0627\u0633\u062a\u062e\u062f\u0645 \u062d\u0633\u0627\u0628 \u0627\u0644\u062a\u062c\u0631\u064a\u0628.',

  // Footer
  'footer.institution': '\u0645\u062e\u062a\u0628\u0631 \u063a\u0631\u0628\u064a\u0629 2026',
  'footer.platform': '\u0645\u0646\u0635\u0629 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0628\u064a\u0626\u064a',

  // Dashboard
  'dashboard.ehi.category.excellent': '\u0645\u0645\u062a\u0627\u0632',
  'dashboard.ehi.category.good': '\u062c\u064a\u062f',
  'dashboard.ehi.category.moderate': '\u0645\u062a\u0648\u0633\u0637',
  'dashboard.ehi.category.poor': '\u0636\u0639\u064a\u0641',
  'dashboard.ehi.category.critical': '\u062d\u0631\u062c',
  'dashboard.title.page': '\u0644\u0648\u062d\u0629 \u062a\u062d\u0643\u0645 \u0628\u064a\u0626\u064a\u0629',
  'dashboard.subtitle.page': '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0641\u064a \u0627\u0644\u0648\u0642\u062a',
  'dashboard.alert.mqttUnavailable': '\u062e\u0627\u062f\u0645 MQTT \u063a\u064a\u0631 \u0645\u062a\u0648\u0641\u0631. \u062a\u0623\u0643\u062f \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u062e\u0627\u062f\u0645 \u0627\u0644\u062e\u0627\u0635.',
  'dashboard.mode.live': '\u0627\u0644\u0636\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631',
  'dashboard.mode.simulation': '\u0648\u0636\u0639 \u0627\u0644\u0645\u062d\u0627\u0643\u0627\u0629',
  'dashboard.mode.realMqtt': '(\u0645\u0628\u0627\u0634\u0631 \u0641\u0639\u0644\u064a)',
  'dashboard.tooltip.disabledInLive': '\u0645\u0639\u0637\u0644 \u0641\u064a \u0648\u0636\u0639 \u0627\u0644\u0636\u0628\u0637',
  'dashboard.tooltip.simulateReadings': '\u0645\u062d\u0627\u0643\u0627\u0629 \u0642\u0631\u0627\u0621\u0627\u062a \u0645\u0633\u062a\u0642\u0631\u0629 \u062c\u062f\u064a\u062f\u0629',
  'dashboard.button.simulateUpdate': '\u062a\u062d\u062f\u064a\u062b \u0627\u0644\u0645\u062d\u0627\u0643\u0627\u0629',
  'dashboard.switchingMode': '\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 {mode}...',
  'dashboard.ehi.label': '\u0645\u0639\u0644\u0648\u0645 \u0627\u0644\u0635\u062d\u0629 \u0627\u0644\u0628\u064a\u0626\u064a\u0629',
  'dashboard.lastUpdated': '\u0622\u062e\u0631 \u062a\u062d\u062f\u064a\u062b',
  'dashboard.subIndices': '6 \u0641\u0631\u0639\u0627\u062a \u0641\u0631\u0639\u064a\u0629',
  'dashboard.subIndexList': '\u0627\u0644\u0647\u0648\u0627\u0621 \u2022 \u0627\u0644\u0645\u0627\u0621 \u2022 \u0627\u0644\u0633\u0644\u0627\u0645\u0629 \u0627\u0644\u0628\u0634\u0631\u064a\u0629 \u2022 \u0627\u0644\u0628\u064a\u0626\u0629 \u2022 \u0627\u0644\u0627\u0633\u062a\u062f\u0627\u0645\u0629 \u2022 \u0627\u0644\u0627\u0633\u062a\u0642\u0631\u0627\u0621',
  'dashboard.button.viewAiAnalysis': '\u0639\u0631\u0636 \u0627\u0644\u062a\u062d\u0644\u064a\u0644 AI \u0627\u0644\u0643\u0627\u0645\u0644',
  'dashboard.stat.airQualityIndex': '\u0645\u0639\u0631\u0641 \u062c\u0648\u062f\u0629 \u0627\u0644\u0647\u0648\u0627\u0621',
  'dashboard.stat.waterQualityIndex': '\u0645\u0639\u0631\u0641 \u062c\u0648\u062f\u0629 \u0627\u0644\u0645\u0627\u0621',
  'dashboard.stat.activeAlerts': '\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0627\u0644\u0646\u0634\u0637\u0629',
  'dashboard.stat.connectedDevices': '\u0627\u0644\u0623\u062c\u0647\u0632\u0629 \u0627\u0644\u0645\u062a\u0635\u0644\u0629',
  'dashboard.chart.ehiTrendTitle': '\u0627\u062a\u062c\u0627\u0647 EHI (\u0622\u062e\u0631 8 \u0633\u0627\u0639\u0627\u062a)',
  'dashboard.chart.trendSuffix': '\u0627\u062a\u062c\u0627\u0647',
  'dashboard.button.viewAnalytics': '\u0639\u0631\u0636 \u0627\u0644\u062a\u062d\u0644\u064a\u0644\u0627\u062a \u0627\u0644\u0643\u0627\u0645\u0644\u0629',
  'dashboard.section.virtualSensors': '\u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'dashboard.button.viewAll': '\u0639\u0631\u0636 \u0627\u0644\u0643\u0644',
  'dashboard.section.livePhysicalSensors': '\u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0641\u064a\u0632\u064a\u0629 \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629',
  'dashboard.section.topVirtualSensors': '\u0623\u0639\u0644\u0649 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'dashboard.button.viewAllArrow': '\u0639\u0631\u0636 \u0627\u0644\u0643\u0644 \u2192',
  'dashboard.confidenceSuffix': '\u062a\u0623\u0643\u064a\u062f',

  // Sensors
  'sensors.title': '\u0645\u0631\u0627\u0642\u0628\u0629 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0645\u0628\u0627\u0634\u0631\u0629',
  'sensors.subtitle': '13 \u0645\u0633\u062a\u0642\u0631\u0627 \u0641\u064a\u0632\u064a\u0629 + 10 \u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'sensors.badge.liveFromMqtt': '\u0645\u0628\u0627\u0634\u0631 \u0645\u0646 MQTT',
  'sensors.badge.simulationMode': '\u0648\u0636\u0639 \u0627\u0644\u0645\u062d\u0627\u0643\u0627\u0629',
  'sensors.toast.csvExportSuccess': '\u062a\u0645 \u062a\u0635\u062f\u064a\u0631 CSV \u0628\u0646\u062c\u0627\u062d!',
  'sensors.button.exportCsv': '\u062a\u0635\u062f\u064a\u0631 CSV',
  'sensors.toast.excelExportSuccess': '\u062a\u0645 \u062a\u062d\u0645\u064a\u0644 \u0645\u0644\u0641 Excel!',
  'sensors.button.exportExcel': '\u062a\u0635\u062f\u064a\u0631 Excel',
  'sensors.section.physicalSensors': '\u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0641\u064a\u0632\u064a\u0629 (13)',
  'sensors.badge.safe': '\u0622\u0645\u0646',
  'sensors.section.virtualSensors': '\u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'sensors.badge.computed': '\u0645\u062d\u0633\u0648\u0628',
  'sensors.label.confidence': '\u0627\u0644\u062a\u0623\u0643\u064a\u062f',
  'sensors.inputsUsedSuffix': '{count} \u0645\u0639\u062f\u062f\u0627\u062a \u0645\u0633\u062a\u062e\u062f\u0645\u0629',
  'sensors.missingPrefix': '\u0645\u0641\u0642\u0648\u0636: ',

  // Alerts
  'alerts.subtitle': '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0641\u0648\u0631\u064a\u0629 \u0645\u0639 \u0639\u0636\u0648 \u0627\u0644\u0633\u0628\u0628 \u0627\u0644\u062c\u0630\u0631\u064a',
  'alerts.placeholder.search': '\u0628\u062d\u062b \u0639\u0646 \u062a\u0646\u0628\u064a\u0647\u0627\u062a...',
  'alerts.filter.allLevels': '\u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0633\u062a\u0648\u064a\u0627\u062a',
  'alerts.filter.high': '\u0645\u0631\u062a\u0641\u0639',
  'alerts.filter.medium': '\u0645\u062a\u0648\u0633\u0637',
  'alerts.emptyState.noResults': '\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u062a\u0637\u0627\u0628\u0642 \u0628\u0628\u062d\u062b\u0643.',
  'alerts.button.acknowledge': '\u0625\u0630\u0639\u0627\u0632',
  'alerts.status.acknowledged': '\u062a\u0645 \u0625\u0630\u0639\u0627\u0632\u0647\u0627',

  // Device Connection
  'deviceConnection.title': '\u0645\u062f\u064a\u0631 \u0627\u0644\u062a\u0635\u0644 \u0628\u0627\u0644\u062c\u0647\u0627\u0632\u0629',
  'deviceConnection.subtitle': '\u0627\u0635\u0644\u0627\u062d MQTT + \u062a\u0648\u0627\u0641\u0642 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'deviceConnection.label.brokerUrl': '\u0631\u0627\u0628\u0637 WebSocket \u0644\u062e\u0627\u062f\u0645 MQTT',
  'deviceConnection.button.connect': '\u062a\u0635\u0644',
  'deviceConnection.button.disconnect': '\u0642\u0637\u0639 \u0627\u0644\u0627\u062a\u0635\u0627\u0644',
  'deviceConnection.label.status': '\u0627\u0644\u062d\u0627\u0644\u0629: ',
  'deviceConnection.section.virtualCompatibility': '\u062a\u0648\u0627\u0641\u0642 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a\u0629',
  'deviceConnection.description.basedOnConnected': '\u0628\u0646\u0627\u0621\u064b\u0627 \u0639\u0644\u0649 \u0627\u0644\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0627\u0644\u0641\u064a\u0632\u064a\u0629 \u0627\u0644\u0645\u062a\u0635\u0644\u0629 \u062d\u0627\u0644\u064a\u0627\u064b',
  'deviceConnection.label.requires': '\u064a\u062a\u0637\u0644\u0628: ',
  'deviceConnection.status.available': '\u0645\u062a\u0648\u0641\u0631',
  'deviceConnection.label.confidence': '\u0627\u0644\u062a\u0623\u0643\u064a\u062f: ',
  'deviceConnection.status.missingRequired': '\u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0645\u0637\u0644\u0648\u0628\u0629 \u0645\u0641\u0642\u0648\u0636\u0629',

  // Settings
  'settings.title': '\u0627\u0644\u0625\u0639\u062f\u0627\u062f\u0627\u062a',
  'settings.subtitle': '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u0645\u0646\u0635\u0629\u060c \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a\u060c \u0648\u0627\u0644\u062a\u0643\u0627\u0645\u0644\u0627\u062a',
  'settings.section.userRole': '\u062f\u0648\u0631 \u0627\u0644\u0645\u0633\u062a\u062e\u062f\u0645 (\u062a\u062c\u0631\u064a\u0628\u064a)',
  'settings.role.description': '\u0627\u0644\u062f\u0648\u0631 \u0627\u0644\u062d\u0627\u0644\u064a \u064a\u0623\u062b\u0631 \u0639\u0644\u0649 \u0627\u0644\u0645\u0639\u0631\u0641\u0627\u062a \u0627\u0644\u0645\u0631\u0626\u064a\u0629 \u0641\u064a \u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a.',
  'settings.section.pushNotifications': '\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u0627\u0644\u062f\u0641\u0639 (ntfy.sh)',
  'settings.label.notificationTopic': '\u0645\u0648\u0636\u0648\u0639 \u0627\u0644\u0625\u0634\u0639\u0627\u0631',
  'settings.button.save': '\u062d\u0641\u0638',
  'settings.label.subscribe': '\u0627\u0634\u062a\u0631\u0627\u0643: ',
  'settings.button.sendTestNotification': '\u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a',
  'settings.section.mqttIot': 'MQTT \u0648 IoT',
  'settings.label.broker': '\u0627\u0644\u062e\u0627\u062f\u0645: ',
  'settings.label.topics': '\u0627\u0644\u0645\u0648\u0627\u0636\u0639: ',
  'settings.status.connectedWhenLive': '\u0627\u0644\u062d\u0627\u0644\u0629: \u0645\u062a\u0635\u0644 \u0639\u0646\u062f \u062a\u063a\u0636\u064a\u0627\u062a \u0648\u0636\u0639 \u0627\u0644\u0636\u0628\u0637 \u0627\u0644\u0645\u0628\u0627\u0634\u0631',
  'settings.section.authentication': '\u0627\u0644\u0645\u0635\u0631\u0641\u064a\u0629 (Logto OIDC)',
  'settings.auth.description': '\u062a\u062e\u0637\u064a\u0637 OIDC \u0645\u0639 Logto \u0645\u062e\u0637\u0637\u0637. \u064a\u0633\u062a\u062e\u062f\u0645 \u0648\u0636\u0639 \u0627\u0644\u062a\u062c\u0631\u064a\u0628.',
  'settings.toast.topicSaved': '\u062a\u0645 \u062d\u0641\u0638 \u0627\u0644\u0645\u0648\u0636\u0648\u0639 \u0628\u0646\u062c\u0627\u062d!',
  'settings.toast.sendingTest': '\u062c\u0627\u0631\u064a \u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a...',
  'settings.toast.testSuccess': '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a! \u062a\u062d\u0642\u0642 \u0645\u0646 \u062a\u0637\u0628\u064a\u0642 ntfy.',
  'settings.toast.testFailed': '\u0641\u0634\u0644 \u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631',

  // Settings — Appearance
  'settings.section.appearance': '\u0627\u0644\u0645\u0638\u0647\u0631',
  'settings.label.theme': '\u0627\u0644\u0633\u0645\u0629',
  'settings.theme.dark': '\u062f\u0627\u0643\u0646',
  'settings.theme.light': '\u0641\u0627\u062a\u062d',
  'settings.theme.system': '\u0627\u0644\u0646\u0638\u0627\u0645',
  'settings.label.compactMode': '\u0627\u0644\u0648\u0636\u0639 \u0627\u0644\u0645\u0636\u063a\u0637',
  'settings.label.animations': '\u0627\u0644\u0631\u0633\u0648\u0645 \u0627\u0644\u0645\u062a\u062d\u0631\u0643\u0629',

  // Settings — Data Preferences
  'settings.section.dataPreferences': '\u062a\u0641\u0636\u064a\u0644\u0627\u062a \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
  'settings.label.refreshInterval': '\u0641\u062a\u0631\u0629 \u0627\u0644\u062a\u062d\u062f\u064a\u062b',
  'settings.refresh.10s': '10 \u062b\u0648\u0627\u0646\u064a',
  'settings.refresh.30s': '30 \u062b\u0627\u0646\u064a\u0629',
  'settings.refresh.60s': '\u062f\u0642\u064a\u0642\u0629 \u0648\u0627\u062d\u062f\u0629',
  'settings.refresh.300s': '5 \u062f\u0642\u0627\u0626\u0642',
  'settings.label.chartType': '\u0646\u0648\u0639 \u0627\u0644\u0631\u0633\u0645 \u0627\u0644\u0628\u064a\u0627\u0646\u064a \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a',
  'settings.chart.line': '\u062e\u0637\u0648\u0637',
  'settings.chart.bar': '\u0623\u0639\u0645\u062f\u0629',
  'settings.chart.area': '\u0645\u0646\u0637\u0642\u0629',
  'settings.label.maxDataPoints': '\u0627\u0644\u062d\u062f \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0646\u0642\u0627\u0637 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
  'settings.label.dataRetention': '\u0627\u062d\u062a\u0641\u0627\u0638 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',

  // Settings — Alert Preferences
  'settings.section.alertPreferences': '\u062a\u0641\u0636\u064a\u0644\u0627\u062a \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a',
  'settings.label.alertCooldown': '\u062a\u0647\u062f\u0626\u0629 \u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a',
  'settings.cooldown.30s': '30 \u062b\u0627\u0646\u064a\u0629',
  'settings.cooldown.60s': '\u062f\u0642\u064a\u0642\u0629 \u0648\u0627\u062d\u062f\u0629',
  'settings.cooldown.300s': '5 \u062f\u0642\u0627\u0626\u0642',
  'settings.cooldown.600s': '10 \u062f\u0642\u0627\u0626\u0642',
  'settings.label.soundAlerts': '\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0635\u0648\u062a\u064a\u0629',
  'settings.label.autoAcknowledge': '\u062a\u0623\u0643\u064a\u062f \u062a\u0644\u0642\u0627\u0626\u064a',

  // Settings — System Info
  'settings.section.systemInfo': '\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0646\u0638\u0627\u0645',
  'settings.label.version': '\u0627\u0644\u0625\u0635\u062f\u0627\u0631',
  'settings.label.uptime': '\u0648\u0642\u062a \u0627\u0644\u062a\u0634\u063a\u064a\u0644',
  'settings.label.dbStatus': '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0628\u064a\u0627\u0646\u0627\u062a',
  'settings.label.apiStatus': 'API',
  'settings.label.mqttStatus': 'MQTT',
  'settings.status.healthy': '\u0635\u062d\u064a',
  'settings.status.degraded': '\u0645\u062a\u062f\u0647\u0648\u0631',
  'settings.status.down': '\u0645\u062a\u0648\u0642\u0641',

  // Map
  'map.title': '\u0627\u0644\u062e\u0631\u064a\u0637\u0629 \u0627\u0644\u0628\u064a\u0626\u064a\u0629',
  'map.subtitle': '12 \u0645\u062d\u0627\u0641\u0638\u0629 \u2022 \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0633\u062a\u0642\u0631\u0627\u062a \u0645\u0628\u0627\u0634\u0631\u0629 \u2022 \u062e\u0631\u064a\u0637\u0629 \u062a\u0641\u0639\u0627\u0644\u064a\u0629',
  'map.section.governoratesOverview': '\u0646\u0638\u0631\u0629 \u0639\u0627\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0645\u062d\u0627\u0641\u0638\u0627\u062a',
  'map.detailViewSuffix': ' \u2014 \u0639\u0631\u0636 \u062a\u0641\u0635\u064a\u0644\u064a',
  'map.label.ehiScore': '\u0646\u062a\u064a\u062c\u0629 EHI: ',
  'map.label.pm25': 'PM2.5: ',
  'map.label.status': '\u0627\u0644\u062d\u0627\u0644\u0629: ',
  'common.status.good': '\u062c\u064a\u062f',
  'common.status.moderate': '\u0645\u062a\u0648\u0633\u0637',
  'common.status.excellent': '\u0645\u0645\u062a\u0627\u0632',

  // AI Engine
  'ai.title': '\u0645\u062d\u0631\u0631 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a',
  'ai.subtitle': '3 \u0645\u0633\u062a\u0648\u064a\u0627\u062a \u062a\u062d\u0644\u064a\u0644 \u2022 \u0639\u0636\u0648 \u0627\u0644\u0633\u0628\u0628 \u2022 \u0646\u0638\u0645 \u0627\u0644\u062a\u0623\u0643\u064a\u062f',
  'ai.level.simple.name': '\u0628\u0633\u064a\u0637',
  'ai.level.simple.description': '\u0645\u0644\u062e\u0635 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062d\u0627\u0644\u0629 \u0628\u0634\u0643\u0644 \u0645\u0641\u0647\u0648\u0645 \u0644\u0644\u0625\u0646\u0633\u0627\u0646',
  'ai.level.scientific.name': '\u0639\u0644\u0645\u064a',
  'ai.level.scientific.description': '\u0645\u0631\u0627\u062c\u0639 WHO/EPA/\u0645\u0635\u0631 \u0627\u0644\u0645\u0639\u0627\u064a\u064a\u0631',
  'ai.level.expert.name': '\u062e\u0628\u064a\u0631',
  'ai.level.expert.description': '\u0641\u064a\u0632\u064a\u0627\u0621 \u0627\u0644\u063a\u0628\u0627\u0631\u060c \u0643\u064a\u0645\u064a\u0627\u0621 \u0627\u0644\u0645\u0627\u0621\u060c \u0627\u0644\u063a\u064a\u0627\u0633\u0648\u0644\u0648\u062c\u064a\u0627',
  'ai.analyzingPrefix': '\u2022 \u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0644\u064a\u0644: ',
  'ai.section.scientificEhi': '\u0645\u0639\u0644\u0648\u0645 \u0627\u0644\u0635\u062d\u0629 \u0627\u0644\u0628\u064a\u0626\u064a\u0629 \u0627\u0644\u0639\u0644\u0645\u064a (WHO + EPA)',
  'ai.label.statisticalConfidence': '\u0627\u0644\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0625\u062d\u0635\u0627\u0626\u064a',
  'ai.label.weight': '\u0627\u0644\u062a\u0623\u062b\u064a\u0631: ',
  'ai.levelPrefix': '\u0627\u0644\u0645\u0633\u062a\u0648\u0649 ',
  'ai.badge.active': '\u0646\u0634\u0637',

  // Predictions
  'predictions.title': '\u0627\u0644\u062a\u0648\u0628\u064a\u0646\u0627\u062a AI',
  'predictions.subtitle': '\u062a\u0642\u0627\u0631\u064a\u0631 24\u0633 / 48\u0633 / 7\u064a\u0648\u0645 \u0645\u0639 \u0641\u062a\u0631\u0627\u062a \u062a\u0623\u0643\u064a\u062f',
  'predictions.horizon.24h': '24 \u0633\u0627\u0639\u0629',
  'predictions.horizon.48h': '48 \u0633\u0627\u0639\u0629',
  'predictions.horizon.7d': '7 \u0623\u064a\u0627\u0645',
  'predictions.label.confidence': '\u0627\u0644\u062a\u0623\u0643\u064a\u062f',
  'predictions.label.uncertainty': '\u0627\u0644\u063a\u064a\u0627\u0631: \u00b1',
  'predictions.method.ensemble': '\u0627\u0644\u0623\u0646\u0645\u0627\u0637: \u0627\u062a\u062c\u0627\u0647 \u062e\u0637\u064a + \u0645\u062a\u0648\u0633\u0637 \u0645\u062a\u062d\u0631\u0643 + \u0645\u062e\u0628\u0631 \u063a\u064a\u0631 \u0645\u0639\u0644\u0648\u0645',
  'predictions.label.currentEhi': 'EHI \u0627\u0644\u062d\u0627\u0644\u064a: ',
  'predictions.summary.stable': '\u062a\u062a\u0646\u0628\u0626 \u0627\u0644\u0646\u0638\u0627\u0645 \u0639\u0644\u0649 \u0634\u0631\u0648\u0637 \u0645\u0633\u062a\u0642\u0631\u0629 \u0623\u0648 \u0628\u062d\u0633\u064a\u0646 \u0639\u0644\u0649 \u0627\u0644\u062d\u0627\u0644\u0629 \u0641\u064a \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u0642\u0627\u062f\u0645.',
  'predictions.badge.realData': '\u064a\u0633\u062a\u062e\u062f\u0645 \u0628\u064a\u0627\u0646\u0627\u062a \u0623\u062c\u0647\u0632\u0629 \u062d\u0642\u064a\u0642\u064a\u0629',
  'predictions.badge.estimatedData': '\u064a\u0633\u062a\u062e\u062f\u0645 \u0628\u064a\u0627\u0646\u0627\u062a \u0645\u0642\u062f\u0631\u0629',
  'predictions.accuracy.title': '\u062f\u0642\u0629 \u0627\u0644\u062a\u0648\u0628\u064a\u0646\u0627\u062a (\u0622\u062e\u0631 5 \u062a\u062c\u0631\u064a\u0628\u0627\u062a)',
  'predictions.label.averageError': '\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u062e\u0637\u0623',
  'predictions.label.accuracyScore': '\u0645\u0624\u0634\u0631 \u0627\u0644\u062f\u0642\u0629',
  'predictions.label.testsRun': '\u0627\u0644\u062a\u062c\u0627\u0631\u064a\u0628 \u0627\u0644\u0645\u0642\u0648\u0645 \u0628\u0647\u0627',

  // Analytics
  'analytics.title': '\u0627\u0644\u062a\u062d\u0644\u064a\u0644\u0627\u062a \u0627\u0644\u0645\u062a\u0642\u062f\u0645\u0629',
  'analytics.subtitle': '\u0627\u062a\u062c\u0627\u0647\u0627\u062a \u2022 \u0631\u062f\u0627\u0631 \u2022 \u062a\u0632\u0648\u064a\u0646 \u2022 \u0627\u0631\u062a\u0628\u0627\u0637\u0627\u062a',
  'analytics.chart.ehiTrendTitle': '\u0627\u062a\u062c\u0627\u0647 \u0645\u0639\u0644\u0648\u0645 \u0627\u0644\u0635\u062d\u0629 \u0627\u0644\u0628\u064a\u0626\u064a\u0629 (12\u0633)',
  'analytics.chart.virtualSensorProfile': '\u0628\u0631\u0648\u0641\u0627\u064a\u0644 \u0627\u0644\u0645\u0633\u062a\u0642\u0631 \u0627\u0644\u0627\u0641\u062a\u0636\u0627\u0631\u064a',
  'analytics.chart.airWaterCorrelation': '\u0627\u0631\u062a\u0628\u0627\u0637 \u062c\u0648\u062f\u0629 \u0627\u0644\u0647\u0648\u0627\u0621 \u0648\u0627\u0644\u0645\u0627\u0621',
  'analytics.chart.line.airQuality': '\u062c\u0648\u062f\u0629 \u0627\u0644\u0647\u0648\u0627\u0621',
  'analytics.chart.line.waterQuality': '\u062c\u0648\u062f\u0629 \u0627\u0644\u0645\u0627\u0621',

  // Automation
  'automation.title': '\u0645\u062d\u0631\u0631 \u0627\u0644\u0623\u062a\u0645\u062a\u0639',
  'automation.subtitle': '\u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062f\u0641\u0639 ntfy.sh \u0648\u062a\u062d\u0643\u0645 \u0627\u0644\u062c\u0647\u0627\u0632\u0629',
  'automation.ntfy.testTitle': '\u0627\u062e\u062a\u0628\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a PERN',
  'automation.ntfy.testMessage': '\u0625\u0634\u0639\u0627\u0631 \u062a\u062c\u0631\u064a\u0628\u064a \u0645\u0646 \u0645\u062d\u0631\u0631 \u0627\u0644\u0623\u062a\u0645\u062a\u0639. EHI \u0627\u0644\u062d\u0627\u0644\u064a: {ehi}',
  'automation.toast.testSent': '\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631 \u0627\u0644\u062a\u062c\u0631\u064a\u0628\u064a!',
  'automation.toast.testFailed': '\u0641\u0634\u0644 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0625\u0634\u0639\u0627\u0631',
  'automation.button.sendTestNotification': '\u0625\u0631\u0633\u0627\u0644 \u0625\u0634\u0639\u0627\u0631 ntfy \u062a\u062c\u0631\u064a\u0628\u064a',
  'automation.label.ntfyTopic': '\u0645\u0648\u0636\u0648\u0639 ntfy.sh',
  'automation.button.saveTopic': '\u062d\u0641\u0638 \u0627\u0644\u0645\u0648\u0636\u0648\u0639',
  'automation.section.activeRules': '\u0642\u0648\u0627\u0639\u062f \u0627\u0644\u0623\u062a\u0645\u062a\u0639 \u0627\u0644\u0646\u0634\u0637\u0629 (\u062a\u0646\u0641\u064a\u0630 \u0645\u0631\u062a\u0628\u0637)',
  'automation.status.enabled': '\u0645\u0641\u0639\u0644',
  'automation.status.disabled': '\u0645\u0639\u0637\u0644',
  'automation.section.actuatorStatus': '\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u062d\u0631\u0643\u0627\u062a \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629',
  'automation.badge.live': '\u0645\u0628\u0627\u0634\u0631',
  'automation.emptyState.noActuatorCommands': '\u0644\u0645 \u062a\u0633\u0628\u0636 \u0623\u0648\u0627\u0645\u0631 \u0645\u062d\u0631\u0643\u0627\u062a \u0628\u0639\u062f. \u0633\u062a\u062d\u062f\u062b \u0627\u0644\u0642\u0648\u0627\u0639\u062f \u0647\u0630\u0627 \u0627\u0644\u0642\u0633\u0645 \u0639\u0646\u062f \u0627\u0644\u062a\u0641\u0639\u064a\u0644.',
  'automation.label.lastChanged': '\u0622\u062e\u0631 \u062a\u063a\u064a\u064a\u0631: ',
  'automation.section.executionLog': '\u0633\u062c\u0644 \u0627\u0644\u062a\u0646\u0641\u064a\u0630 + \u0623\u0648\u0627\u0645\u0631 \u0627\u0644\u0645\u062d\u0631\u0643\u0627\u062a \u0627\u0644\u062d\u0642\u064a\u0642\u064a\u0629',
  'automation.emptyState.logPlaceholder': '\u062a\u062a\u0645 \u062a\u0642\u064a\u064a\u0645 \u0627\u0644\u0642\u0648\u0627\u0639\u062f \u0643\u0644 8 \u062b\u0648\u0627\u0646\u064a. \u062a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0623\u0648\u0627\u0645\u0631 MQTT \u0644\u0644\u0645\u062d\u0631\u0643\u0627\u062a \u0639\u0646\u062f \u062a\u0644\u0627\u0628\u0642 \u0627\u0644\u0634\u0631\u0648\u0637.',
};

const dictionaries: Record<Locale, Record<string, string>> = { en, ar };

function lookup(dict: Record<string, string>, key: string): string {
  if (key in dict) return dict[key];
  const parts = key.split('.');
  // Try progressively shorter keys (e.g. "nav.dashboard" -> look up "dashboard")
  if (parts.length > 1) {
    const shortKey = parts[parts.length - 1];
    if (shortKey in dict) return dict[shortKey];
  }
  return key;
}

/* ─── Provider ─── */

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Locale) || 'en';
    } catch {
      return 'en';
    }
  });

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  // Sync <html> dir & lang attributes
  useEffect(() => {
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback((key: string) => lookup(dictionaries[locale], key), [locale]);

  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  const tWithInterp = useCallback(
    (key: string, fallback?: string, params?: Interpolation) => {
      let str = lookup(dictionaries[ctx.locale], key);
      if (str === key && fallback) str = fallback;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    },
    [ctx.locale],
  );
  return { ...ctx, t: tWithInterp };
}
