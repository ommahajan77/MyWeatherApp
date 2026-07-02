/* =========================================================
   WeatherNow
   Fetches current weather + air quality (AQI) from the
   OpenWeatherMap API and renders it into the page.
   ========================================================= */

// ⚠️ Get your own free key at https://openweathermap.org/api
// Do NOT commit a real key to a public repo — load it from an
// environment variable / build-time config instead in production.
const API_KEY = "c60c9d5619794d5032dc763fae5932d7";

const WEATHER_URL = "https://api.openweathermap.org/data/2.5/weather";
const AQI_URL = "https://api.openweathermap.org/data/2.5/air_pollution";

const $ = (selector) => document.querySelector(selector);

let isFetching = false; // guards against duplicate in-flight requests
let isPopupOpen = false; // tracks the "what does this mean?" popup

/* ---------------------------------------------------------
   Static lookup data
   --------------------------------------------------------- */

// Plain-language explanations shown in the info popup
const WEATHER_DESCRIPTIONS = {
  "overcast clouds":
    "‘Overcast clouds’ refer to a sky completely covered by clouds. It usually means dull weather, with very low sunlight and cooler temperatures.",
  "clear sky":
    "A ‘clear sky’ means no clouds at all. Expect bright sunshine and no precipitation.",
  "few clouds":
    "‘Few clouds’ means mostly sunny with occasional cloud patches.",
  "scattered clouds":
    "‘Scattered clouds’ are spread out and cover less than half the sky. It’s typically still bright outside.",
  "broken clouds":
    "‘Broken clouds’ cover more than half the sky but allow some sunshine through.",
  "light rain":
    "‘Light rain’ refers to a gentle rainfall, often short-lived but can still make the surroundings wet.",
  "moderate rain":
    "‘Moderate rain’ is steady and can last a while. It’s more intense than light rain.",
  "heavy rain":
    "‘Heavy rain’ is intense and continuous. Be cautious of flooding in low-lying areas.",
  thunderstorm:
    "‘Thunderstorms’ include lightning, thunder, and usually heavy rain. Stay indoors if possible.",
  mist: "‘Mist’ is a thin layer of fog, reducing visibility but not as dense as fog.",
};

// Maps OpenWeatherMap's "main" condition to a local icon file
const ICON_MAP = {
  Clear: "clear",
  Rain: "rain",
  Drizzle: "rain",
  Thunderstorm: "storm",
  Snow: "snow",
  Mist: "mist",
  Smoke: "mist",
  Haze: "mist",
  Fog: "mist",
  Clouds: "cloud",
};

// AQI index (1-6) -> display label + colour class
const AQI_LEVELS = {
  1: { label: "Good", className: "aqi-good" },
  2: { label: "Satisfactory", className: "aqi-satisfactory" },
  3: { label: "Moderate", className: "aqi-moderate" },
  4: { label: "Poor", className: "aqi-poor" },
  5: { label: "Very Poor", className: "aqi-very-poor" },
  6: { label: "Severe", className: "aqi-severe" },
};

/* ---------------------------------------------------------
   DOM references & rendering helpers
   --------------------------------------------------------- */

const ui = {
  card: $(".weather-card"),
  notFound: $(".not-found"),

  temp: $("#tempValue"),
  feels: $("#feels"),
  desc: $("#desc"),
  humidity: $("#humidity"),
  wind: $("#wind"),
  sunrise: $("#sunrise"),
  sunset: $("#sunset"),

  minTemp: $("#min-temp"),
  maxTemp: $("#max-temp"),
  clouds: $("#clouds"),
  visibility: $("#visibility"),
  lastUpdated: $("#lastUpdated"),

  showError(message = "City not found") {
    this.card.hidden = true;
    this.notFound.hidden = false;
    this.notFound.querySelector("p").textContent = message;
  },

  showWeather(data) {
    // Close any open popup left over from a previous search
    descPopup?.classList.add("hidden");
    weatherCard.style.overflowX = "hidden";
    isPopupOpen = false;

    const { main, weather, wind, sys, clouds, visibility } = data;

    this.notFound.hidden = true;
    this.card.hidden = false;

    // Restart the fade-in animation
    this.card.classList.remove("fade");
    void this.card.offsetWidth; // force reflow
    this.card.classList.add("fade");

    this.temp.textContent = `${Math.round(main.temp)}°C`;
    this.feels.textContent = `Feels like ${Math.round(main.feels_like)}°C`;
    this.desc.textContent = weather[0].description;

    const description = weather[0].description.toLowerCase();
    $("#descPopup .popup-text").textContent =
      WEATHER_DESCRIPTIONS[description] ||
      "No additional information available for this weather condition.";

    this.minTemp.textContent = `${Math.round(main.temp_min)}°C`;
    this.maxTemp.textContent = `${Math.round(main.temp_max)}°C`;
    this.humidity.textContent = `${main.humidity}%`;
    this.wind.textContent = `${(wind.speed * 3.6).toFixed(1)} km/h`;
    this.clouds.textContent = `${clouds?.all ?? 0}%`;
    this.visibility.textContent = visibility
      ? `${(visibility / 1000).toFixed(1)} km`
      : "--";

    this.sunrise.textContent = formatTime(sys.sunrise);
    this.sunset.textContent = formatTime(sys.sunset);

    const iconKey = weather[0].main;
    const iconFile = `assets/${ICON_MAP[iconKey] || "cloud"}.png`;
    $("#weatherIcon").innerHTML =
      `<img src="${iconFile}" alt="${iconKey} icon" width="100" height="100">`;

    $("#cityName").textContent = `${data.name}, ${data.sys.country}`;
    this.lastUpdated.textContent = `Last updated: ${formatTime(
      Math.floor(Date.now() / 1000)
    )}`;
  },

  showAQI(aqi) {
    const label = $("#aqiLabel");
    const level = AQI_LEVELS[aqi];

    if (!level) {
      label.innerHTML = "--";
      return;
    }

    label.innerHTML = `
      <span>${level.label}</span>
      <span class="aqi-badge ${level.className}" title="${level.label}"></span>
      <span class="aqi-level">(${aqi})</span>
    `;
  },
};

// Converts a Unix timestamp to a short local time string (e.g. "6:42 AM")
function formatTime(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

/* ---------------------------------------------------------
   API calls
   --------------------------------------------------------- */

async function fetchWeather(city) {
  const url = `${WEATHER_URL}?q=${encodeURIComponent(city)}&units=metric&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message);
  }
  return res.json();
}

async function fetchAQI(lat, lon) {
  const url = `${AQI_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch AQI");
  const data = await res.json();
  return data.list[0].main.aqi;
}

/* ---------------------------------------------------------
   Search form
   --------------------------------------------------------- */

$("#searchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isFetching) return; // ignore double-submits

  const city = $("#searchInput").value.trim();
  if (!city) return ui.showError("Please enter a city");

  isFetching = true;

  try {
    const weatherData = await fetchWeather(city);
    ui.showWeather(weatherData);

    localStorage.setItem("lastCity", city);
    localStorage.setItem("lastWeatherData", JSON.stringify(weatherData));

    const { lat, lon } = weatherData.coord;
    const aqi = await fetchAQI(lat, lon);
    ui.showAQI(aqi);
  } catch (err) {
    console.error("Fetch error:", err);
    ui.showError("Something went wrong. Please try again.");
    $("#aqiLabel").innerHTML = "--";
  } finally {
    isFetching = false;
  }
});

/* ---------------------------------------------------------
   Restore the last search on page load
   --------------------------------------------------------- */

window.addEventListener("DOMContentLoaded", async () => {
  const lastCity = localStorage.getItem("lastCity");
  const savedData = localStorage.getItem("lastWeatherData");

  if (lastCity) $("#searchInput").value = lastCity;
  if (!savedData) return;

  try {
    const weatherData = JSON.parse(savedData);
    ui.showWeather(weatherData);

    const { lat, lon } = weatherData.coord;
    const aqi = await fetchAQI(lat, lon);
    ui.showAQI(aqi);
  } catch (err) {
    console.error("Invalid saved weather data or AQI:", err);
    localStorage.removeItem("lastWeatherData");
    $("#aqiLabel").innerHTML = "--";
  }
});

/* ---------------------------------------------------------
   Rotating search placeholder
   --------------------------------------------------------- */

const PLACEHOLDER_CITIES = ["Mumbai", "Pune", "Bengaluru", "Delhi", "Hyderabad"];
let placeholderIndex = 0;

setInterval(() => {
  $("#searchInput").placeholder = `Search city (e.g. ${PLACEHOLDER_CITIES[placeholderIndex]})`;
  placeholderIndex = (placeholderIndex + 1) % PLACEHOLDER_CITIES.length;
}, 2500);

/* ---------------------------------------------------------
   Title click -> reset search
   --------------------------------------------------------- */

$(".app-title").addEventListener("click", () => {
  ui.card.hidden = true;
  ui.notFound.hidden = true;
  $("#searchInput").value = "";
  $("#searchInput").focus();
});

/* ---------------------------------------------------------
   Offline banner
   --------------------------------------------------------- */

function updateNetworkBanner() {
  $("#offlineBanner").classList.toggle("hidden", navigator.onLine);
}

updateNetworkBanner();
window.addEventListener("online", updateNetworkBanner);
window.addEventListener("offline", updateNetworkBanner);

$(".close-banner")?.addEventListener("click", () => {
  $("#offlineBanner").classList.add("hidden");
});

/* ---------------------------------------------------------
   "What does this mean?" description popup
   --------------------------------------------------------- */

const descIcon = $("#descInfoIcon");
const descPopup = $("#descPopup");
const weatherCard = $(".weather-card");
const illustrationContainer = $(".weather-illustration-container");

function closeDescPopup() {
  descPopup?.classList.add("hidden");
  weatherCard.style.overflowX = "hidden";
  illustrationContainer?.classList.remove("popup-open");
  isPopupOpen = false;
}

descIcon?.addEventListener("click", (event) => {
  event.stopPropagation();
  isPopupOpen = descPopup.classList.toggle("hidden") === false;

  if (isPopupOpen) {
    weatherCard.style.overflowX = "visible";
    illustrationContainer?.classList.add("popup-open");
  } else {
    weatherCard.style.overflowX = "hidden";
    illustrationContainer?.classList.remove("popup-open");
  }
});

document.addEventListener("click", (event) => {
  const clickedOutside = isPopupOpen && !descPopup?.contains(event.target) && event.target !== descIcon;
  if (clickedOutside) closeDescPopup();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isPopupOpen) closeDescPopup();
});