# PERN User Guide

**Pollution & Environmental Risk Navigator**  
Version 2.5.0

---

## Getting Started

### 1. Accessing the Platform

- Open your browser and go to the PERN web application.
- You will land on the **Dashboard**, which shows the current Environmental Health Index (EHI).

### 2. Understanding the Dashboard

The Dashboard displays:
- **Current EHI Score** with category (Excellent / Good / Moderate / Poor / Critical)
- **Quick Stats** (Air Quality, Water Quality, Active Alerts, Connected Devices)
- **Virtual Sensors** summary
- **Live Physical Sensors**

---

## Main Features

### 1. Live Mode vs Simulation Mode

| Mode | Description | Data Source |
|------|-------------|-------------|
| **Simulation Mode** | Uses generated data for testing | Local simulation |
| **Live Mode** | Connects to real MQTT sensors | Real IoT devices |

**Tip**: Use **Live Mode** when real sensors are connected. Use **Simulation Mode** for testing and demos.

---

### 2. Sensors Page

- View all **13 physical sensors**
- View **10 virtual (soft) sensors**
- Each virtual sensor shows:
  - Value
  - Category
  - **Confidence score**
  - Formula used
  - Missing inputs (if any)

**Export Options**: You can export data as **CSV** or **Excel**.

---

### 3. Automation Page

- Create and manage automation rules
- Rules are evaluated every 8 seconds
- When a rule triggers:
  - Real MQTT command is sent to the actuator
  - Notification is sent via ntfy
  - Status is shown in the **Actuator Status** section

**Example Rule**:
> If PM2.5 > 45 → Turn on Fan

---

### 4. AI Engine Page

Shows:
- **Scientific EHI** (aligned with WHO & EPA)
- **Sub-indices** with sources
- **Evidence-based Recommendations**
- **Statistical Confidence Score**

---

### 5. Device Lifecycle & Health

- View device usage statistics
- See **Health Score**
- Check **Estimated Remaining Life**
- Monitor **Battery, Connectivity, and Hardware health**

---

### 6. Chatbot (AI Assistant)

- Ask questions about current environmental conditions
- The AI has access to:
  - Live sensor data
  - Virtual sensor readings
  - Automation status
- Supports **multi-turn conversations**

---

## Organization vs Personal Use

PERN supports two types of users:

| Type | Description |
|------|-------------|
| **Organization** | Companies or institutions (Giza Municipality, Cairo Governorate, etc.) |
| **Individual** | Personal use or research |

You can switch between organizations using the **Organization Switcher** in the top bar.

---

## Tips for Best Results

1. **Use Live Mode** when real sensors are available
2. **Check the AI Engine** regularly for recommendations
3. **Monitor Device Health** to plan maintenance
4. **Use Automation** to reduce manual intervention
5. **Export data** regularly for reports and analysis

---

## Support

For technical issues or questions, contact your system administrator.

---

*PERN – Environmental Intelligence Platform*  
STEM Gharbiya • 2026