// Simulated real-time data for Barangay Triangulo, Naga City
// In production, these would connect to PAGASA API / DOST-ASTI sensors

export const ALERT_LEVELS = {
  NORMAL: {
    label: 'Normal',
    color: '#22c55e',
    bg: '#dcfce7',
    border: '#16a34a',
    description: 'No significant flooding risk. Water levels within safe range.',
    action: 'No action required. Continue monitoring.',
    level: 0,
  },
  ADVISORY: {
    label: 'Advisory',
    color: '#eab308',
    bg: '#fef9c3',
    border: '#ca8a04',
    description: 'Elevated water levels. Minor flooding possible in low-lying areas.',
    action: 'Residents near waterways should be on alert.',
    level: 1,
  },
  WARNING: {
    label: 'Warning',
    color: '#f97316',
    bg: '#ffedd5',
    border: '#ea580c',
    description: 'Significant flooding expected. Zone 3 at high risk.',
    action: 'Prepare evacuation. Secure valuables. Monitor updates.',
    level: 2,
  },
  CRITICAL: {
    label: 'Critical',
    color: '#ef4444',
    bg: '#fee2e2',
    border: '#dc2626',
    description: 'Severe flooding imminent. Immediate danger to life and property.',
    action: 'EVACUATE IMMEDIATELY. Proceed to designated evacuation centers.',
    level: 3,
  },
};

export const generateWaterLevelData = () => {
  const hours = [];
  const now = new Date();
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now - i * 60 * 60 * 1000);
    const baseLevel = 1.8;
    const variance = Math.sin((23 - i) * 0.4) * 0.6 + Math.random() * 0.3;
    hours.push({
      time: time.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
      level: parseFloat((baseLevel + variance).toFixed(2)),
      threshold: 3.5,
      critical: 4.5,
    });
  }
  // Spike recent hours to show warning
  hours[22].level = 3.1;
  hours[23].level = 3.4;
  return hours;
};

export const generateRainfallData = () => {
  const data = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      rainfall: parseFloat((Math.random() * 40 + 5).toFixed(1)),
      average: 18.5,
    });
  }
  data[5].rainfall = 62.3;
  data[6].rainfall = 45.1;
  return data;
};

export const HISTORICAL_FLOODS = [
  {
    id: 1,
    date: 'November 2023',
    typhoon: 'Typhoon Kristine',
    severity: 'CRITICAL',
    affected_zones: ['Zone 1', 'Zone 2', 'Zone 3'],
    max_water_level: '5.2m',
    casualties: 0,
    displaced: 312,
    duration_hours: 18,
    notes: 'Bicol River overflowed. Evacuation of 312 families.',
  },
  {
    id: 2,
    date: 'August 2023',
    typhoon: 'Typhoon Egay',
    severity: 'WARNING',
    affected_zones: ['Zone 2', 'Zone 3'],
    max_water_level: '4.1m',
    casualties: 0,
    displaced: 148,
    duration_hours: 11,
    notes: 'Flooding in low-lying areas. Preemptive evacuation conducted.',
  },
  {
    id: 3,
    date: 'October 2022',
    typhoon: 'Typhoon Paeng',
    severity: 'CRITICAL',
    affected_zones: ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4'],
    max_water_level: '6.0m',
    casualties: 2,
    displaced: 520,
    duration_hours: 30,
    notes: 'Worst flooding in 5 years. All zones affected.',
  },
  {
    id: 4,
    date: 'July 2022',
    typhoon: 'Tropical Storm Florita',
    severity: 'ADVISORY',
    affected_zones: ['Zone 3'],
    max_water_level: '3.6m',
    casualties: 0,
    displaced: 45,
    duration_hours: 6,
    notes: 'Localized flooding near Bicol River banks.',
  },
  {
    id: 5,
    date: 'December 2021',
    typhoon: 'Typhoon Odette',
    severity: 'WARNING',
    affected_zones: ['Zone 2', 'Zone 3'],
    max_water_level: '4.3m',
    casualties: 0,
    displaced: 210,
    duration_hours: 14,
    notes: 'Storm surge combined with river overflow.',
  },
];

export const WEATHER_FORECAST = [
  { time: '6H', condition: 'Heavy Rain', icon: '⛈', temp: '24°C', rain_chance: 85, wind: '45 km/h' },
  { time: '12H', condition: 'Moderate Rain', icon: '🌧', temp: '23°C', rain_chance: 70, wind: '35 km/h' },
  { time: '18H', condition: 'Light Rain', icon: '🌦', temp: '24°C', rain_chance: 55, wind: '25 km/h' },
  { time: '24H', condition: 'Cloudy', icon: '☁️', temp: '25°C', rain_chance: 30, wind: '20 km/h' },
  { time: '36H', condition: 'Partly Cloudy', icon: '⛅', temp: '26°C', rain_chance: 20, wind: '18 km/h' },
  { time: '48H', condition: 'Sunny', icon: '☀️', temp: '28°C', rain_chance: 10, wind: '15 km/h' },
  { time: '72H', condition: 'Partly Cloudy', icon: '⛅', temp: '27°C', rain_chance: 25, wind: '20 km/h' },
];

export const DATA_SOURCES = [
  {
    name: 'WeatherAPI.com (Naga City)',
    status: 'live',
    last_update: 'Real-time',
    type: 'rainfall',
    description: 'Live rainfall, wind speed, and humidity data fetched from WeatherAPI.com using coordinates 13.62, 123.19 (Naga City, Bicol).',
  },
  {
    name: 'LSTM Flood Prediction Model',
    status: 'live',
    last_update: 'Every 30 seconds',
    type: 'ai_model',
    description: 'Trained LSTM model (flood_model_triangulo.h5) running on local Flask backend. Outputs flood probability and alert level based on live weather inputs.',
  },
  {
    name: 'Typhoon Signal Estimator',
    status: 'simulated',
    last_update: 'Real-time',
    type: 'sensor',
    description: 'Derived from WeatherAPI wind speed data. Signal 1–4 estimated using PAGASA wind thresholds (>30, >61, >121, >185 km/h).',
  },
  {
    name: 'Antecedent Moisture (Humidity)',
    status: 'live',
    last_update: 'Real-time',
    type: 'sensor',
    description: 'Humidity percentage from WeatherAPI, used as a proxy for soil moisture in the LSTM model input sequence.',
  },
  {
    name: 'Seasonal Cyclical Encoder',
    status: 'live',
    last_update: 'System clock',
    type: 'local',
    description: 'Month-of-year encoded as sine/cosine values using the server system clock. Captures seasonal flood patterns (e.g. typhoon season June–November).',
  },
  {
    name: 'Water Level Sensor (Bicol River)',
    status: 'offline',
    last_update: 'No data',
    type: 'sensor',
    description: 'Physical water level sensor at Triangulo station. Currently offline — no readings available. Live gauge and chart on the dashboard will populate once the sensor is connected.',
  },
  {
    name: 'flood_main_dataset_.csv (Training Data)',
    status: 'offline',
    last_update: 'April 2026',
    type: 'historical',
    description: 'Historical flood records for Barangay Triangulo used to train the LSTM model. Not used in live prediction — model weights already saved in .h5 file.',
  },
];

export const FLOOD_ZONES = [
  { id: 'Z1', name: 'Zone 1', risk: 'LOW', households: 234, color: '#22c55e' },
  { id: 'Z2', name: 'Zone 2', risk: 'MODERATE', households: 187, color: '#eab308' },
  { id: 'Z3', name: 'Zone 3', risk: 'HIGH', households: 156, color: '#f97316' },
  { id: 'Z4', name: 'Zone 4', risk: 'LOW', households: 201, color: '#22c55e' },
];

export const NOTIFICATION_LOG = [
  { id: 1, time: '10:32 AM', type: 'INFO', message: 'Water level sensor (Bicol River / Triangulo Station) is offline. No readings currently available.', sent_by: 'System', read: false },
  { id: 2, time: '09:15 AM', type: 'ADVISORY', message: 'Rainfall accumulation exceeded 40mm in the last 3 hours.', sent_by: 'System', read: false },
  { id: 3, time: '08:00 AM', type: 'INFO', message: 'PAGASA forecast: Heavy rainfall expected 12-18 hours.', sent_by: 'Admin', read: true },
  { id: 4, time: 'Yesterday 11:45 PM', type: 'NORMAL', message: 'Water levels returned to normal. All clear.', sent_by: 'System', read: true },
  { id: 5, time: 'Yesterday 3:20 PM', type: 'WARNING', message: 'Flash flood advisory for Bicol River basin.', sent_by: 'PAGASA', read: true },
  { id: 6, time: 'Yesterday 8:00 AM', type: 'INFO', message: 'Daily monitoring report generated.', sent_by: 'System', read: true },
];