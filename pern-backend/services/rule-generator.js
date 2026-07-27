/**
 * PERN AI Rule Generator
 * Converts natural language into structured automation rules
 */

const fetch = require('node-fetch');
const logger = require('../utils/logger');
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.AI_RULE_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';

class RuleGenerator {
  async generateRuleFromText(naturalLanguage, context = {}) {
    const systemPrompt = `You are an expert at converting natural language into environmental automation rules.

Available sensors: pm25, ph, tds, tmp, hum, co2, dO, tb, mq, voc, sm, wT

Available actuators: fan, pump, relay, buzzer, led

Available operators: >, <, >=, <=, ==

Output ONLY a valid JSON object with this exact structure:
{
  "name": "Short descriptive name",
  "sensor": "sensor_key",
  "operator": "operator",
  "threshold": number,
  "action": {
    "device": "device_id",
    "actuator": "actuator_type",
    "command": "on" or "off"
  },
  "priority": 1-10,
  "enabled": true
}

If the request cannot be converted into a valid rule, return:
{ "error": "reason" }`;

    const userPrompt = `Convert this request into an automation rule:\n"${naturalLanguage}"\n\nCurrent context: ${JSON.stringify(context)}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      let response;
      try {
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 300
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        return { error: `OpenRouter HTTP ${response.status}: ${errBody.slice(0, 200)}` };
      }

      const data = await response.json();

      if (!data.choices || !data.choices.length) {
        return { error: 'OpenRouter returned empty response' };
      }

      const content = data.choices[0].message?.content?.trim() || '';

      // Try to parse JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { error: "Could not generate a valid rule from your request." };
      }

      const rule = JSON.parse(jsonMatch[0]);

      if (rule.error) {
        return { error: rule.error };
      }

      // Basic validation
      if (!rule.sensor || !rule.operator || rule.threshold === undefined) {
        return { error: "The generated rule is incomplete." };
      }

      return { success: true, rule };

    } catch (error) {
      logger.error('[Rule Generator]', { error: error.message });
      return { error: "Failed to generate rule. Please try again." };
    }
  }
}

module.exports = new RuleGenerator();