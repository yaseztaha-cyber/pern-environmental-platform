/**
 * Environment Variable Validator
 * Ensures required secrets are present before the app starts
 */

const requiredVars = [
  'DATABASE_URL'
];

const optionalVars = [
  'PORT',
  'NTFY_TOPIC',
  'OPENROUTER_API_KEY',
  'JWT_SECRET',
  'MQTT_BROKER',
  'LOG_LEVEL'
];

function validateEnv() {
  const missing = [];
  const warnings = [];
  const insecure = [];

  requiredVars.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  optionalVars.forEach(key => {
    if (!process.env[key]) {
      warnings.push(key);
    }
  });

  // Check for obviously insecure default values
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    insecure.push('JWT_SECRET (too short)');
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('password')) {
    insecure.push('DATABASE_URL (contains default password)');
  }

  if (missing.length > 0 && process.env.NODE_ENV !== 'test') {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
  }

  if (insecure.length > 0 && process.env.NODE_ENV !== 'test') {
    console.error('❌ Insecure configuration detected:');
    insecure.forEach(v => console.error(`   - ${v}`));
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Missing optional environment variables (some features may be limited):');
    warnings.forEach(v => console.warn(`   - ${v}`));
  }

  console.log('✅ Environment variables validated successfully');
}

module.exports = { validateEnv };