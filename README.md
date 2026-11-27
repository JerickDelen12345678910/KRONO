<div align="center">

# KRONO

**Unified Daily Scheduling, Fitness Intelligence, and Live Route Navigation**

[![Live Web App](https://img.shields.io/badge/Web_App-Live_on_Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)](https://multi-purpose-app-ph.web.app)
[![Android APK](https://img.shields.io/badge/Android-Download_APK_v1.0.0-3DDC84?style=for-the-badge&logo=android&logoColor=black)](https://github.com/JerickDelen12345678910/KRONO/releases/latest)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Capacitor](https://img.shields.io/badge/Capacitor-Android_Native-119EFF?style=for-the-badge&logo=capacitor&logoColor=white)](https://capacitorjs.com/)

[Live Demo](https://multi-purpose-app-ph.web.app) · [Download Android APK](https://github.com/JerickDelen12345678910/KRONO/releases/latest) · [Report Bug](https://github.com/JerickDelen12345678910/KRONO/issues)

</div>

---

## Overview

**KRONO** is a cross-platform personal productivity, fitness tracking, and real-time navigation application engineered for both **Web (PWA)** and **Native Android**. Designed with an offline-first architecture and real-time cloud synchronization, KRONO consolidates daily time-blocking, native alarms, workout programming, macro calculations, and GPS route estimation into a single cohesive workspace.

---

## Key Features

### 1. Dynamic Timeline & Native Alarm Engine

- **Adaptive Day Timeline:** Automatically scales the vertical hourly grid based on scheduled blocks, resolving overlapping events cleanly with category-coded visual indicators and a live current-time marker.
- **Native Android Alarms & Reminders:** Configurable advance reminders, snooze intervals, high-priority notification channels, and support for importing custom local alarm audio files.
- **Android Home-Screen Widget:** Native widget bridge displaying upcoming scheduled events or switching dynamically to live destination ETA mode during active navigation.

### 2. Fitness & Nutrition Suite

- **Interactive Session Runner:** Tracks sets, reps, rest timers, and session state—allowing users to pause, resume unfinished workouts, or review complete historical logs.
- **OCR Program Importer (`PDF` / `Image` / `Text`):** Extracts exercises and set/rep schemes directly from uploaded workout PDFs or photos using client-side OCR (`Tesseract.js` & `PDF.js`) and schedules multi-day routines automatically.
- **Precision Protein & Macro Calculator:** Computes optimal daily protein intake, per-meal distribution, leucine synthesis thresholds, and caloric targets based on body weight, body fat percentage (LBM), training frequency, and phase (_Maintain_, _Bulk_, or _Cut_).
- **Progress Analytics:** Interactive weekly and monthly training volume visualizations.

### 3. Live Navigation & Route Estimator

- **Philippines Place Search & Pinning:** Search locations across the Philippines, drop custom Start/Destination pins directly on the interactive map, and persist favorite destinations for offline access.
- **Live GPS Tracking & Auto-Rerouting:** Continuous geolocation tracking with distance-threshold route recalculation (`25m` anchor delta) and multi-mode routing profiles.
- **Arrive-By Departure Calculator:** Computes recommended departure times from target arrival windows and live OSRM route durations, with one-tap deep-linking to Google Maps.

### 4. Cross-Platform Architecture & Cloud Sync

- **Real-Time Multi-Device Sync:** Seamless Google Authentication and Cloud Firestore synchronization across desktop browsers and the native Android app.
- **Offline-First Resilience:** Local persistence and service-worker caching ensure schedules, saved destinations, and workout tools remain operational without an active internet connection.

---

## Tech Stack

| Layer                     | Technologies                                                                              |
| :------------------------ | :---------------------------------------------------------------------------------------- |
| **Frontend Framework**    | React, Vite, React Router, SCSS, Bootstrap 5                                              |
| **Native Mobile Runtime** | Capacitor (Android), Custom Native Plugins (Google Auth, Alarm Audio, Home-Screen Widget) |
| **Backend & Cloud**       | Firebase Authentication, Cloud Firestore, Firebase Hosting                                |
| **Mapping & Geolocation** | Leaflet, OpenStreetMap, OSRM Routing Engine, Browser/Native Geolocation API               |
| **Document & Image OCR**  | `pdfjs-dist` (PDF parsing), `tesseract.js` (Optical Character Recognition)                |

---

## Project Structure

```text
KRONO/
├── android/                  # Native Android Capacitor project, widgets, & notification channels
├── public/                   # Static PWA manifest, icons, and assets
├── src/
│   ├── components/           # Reusable UI primitives (Timeline, PlacesMap, LineChart, Cards)
│   ├── config/               # App distribution & release endpoint configuration
│   ├── contexts/             # Authentication, Theme, and Service dependency providers
│   ├── hooks/                # Custom React hooks (online status, remote Firestore listeners)
│   ├── lib/                  # Domain logic (route search, map view, fitness view, OCR helpers)
│   ├── models/               # Data schemas and domain constants
│   ├── pages/                # Route views (Dashboard, Schedule, Fitness, MapPage, Account, Login)
│   ├── pwa/                  # Service worker registration and update lifecycle
│   └── styles/               # Modular SCSS design system
├── capacitor.config.json     # Capacitor native build configuration
├── firebase.json             # Firebase Hosting rewrite and deployment rules
└── package.json              # Scripts and dependencies
```
