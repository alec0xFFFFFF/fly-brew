const form = document.getElementById('flight-form');
const flightNumberInput = document.getElementById('flight-number');
const flightDateInput = document.getElementById('flight-date');
const wakeInput = document.getElementById('wake-time');
const sleepInput = document.getElementById('sleep-time');
const submitBtn = document.getElementById('submit-btn');
const errorEl = document.getElementById('error');
const flightInfoEl = document.getElementById('flight-info');
const planSummaryEl = document.getElementById('plan-summary');
const planDaysEl = document.getElementById('plan-days');
const demoFlightsEl = document.getElementById('demo-flights');

// Set default date to today
flightDateInput.valueAsDate = new Date();

// Load demo flights
loadDemos();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  await fetchPlan();
});

async function fetchPlan() {
  const number = flightNumberInput.value.trim();
  const date = flightDateInput.value;
  if (!number || !date) return;

  const wake = timeToDecimal(wakeInput.value);
  const sleep = timeToDecimal(sleepInput.value);

  submitBtn.disabled = true;
  submitBtn.textContent = 'Looking up flight...';
  hideError();

  try {
    const res = await fetch(`/api/plan/${encodeURIComponent(number)}/${encodeURIComponent(date)}?wake=${wake}&sleep=${sleep}`);
    const data = await res.json();

    if (!data.ok) {
      throw new Error(data.error);
    }

    renderFlight(data.flight);
    renderPlan(data.plan);
  } catch (err) {
    showError(err.message);
    flightInfoEl.classList.add('hidden');
    planSummaryEl.classList.add('hidden');
    planDaysEl.classList.add('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Get my Dry Brew plan';
  }
}

function renderFlight(f) {
  document.getElementById('fi-origin').textContent = f.origin.iata;
  document.getElementById('fi-dest').textContent = f.destination.iata;
  document.getElementById('fi-airline').textContent = f.airline;
  document.getElementById('fi-number').textContent = f.flightNumber;
  document.getElementById('fi-status').textContent = f.status;

  const depTime = f.departure.estimated || f.departure.actual || f.departure.scheduled;
  const arrTime = f.arrival.estimated || f.arrival.actual || f.arrival.scheduled;

  document.getElementById('fi-dep-time').textContent = formatDateTime(depTime);
  document.getElementById('fi-dep-city').textContent = f.origin.city;
  document.getElementById('fi-arr-time').textContent = formatDateTime(arrTime);
  document.getElementById('fi-arr-city').textContent = f.destination.city;

  // Duration
  const depMs = new Date(depTime).getTime() - f.origin.offset * 3600000;
  const arrMs = new Date(arrTime).getTime() - f.destination.offset * 3600000;
  const hrs = (arrMs - depMs) / 3600000;
  document.getElementById('fi-duration').textContent = `${Math.floor(hrs)}h ${Math.round((hrs % 1) * 60)}m`;

  // Timezone shift
  const shift = f.destination.offset - f.origin.offset;
  document.getElementById('fi-shift').textContent = `${shift >= 0 ? '+' : ''}${shift}h`;

  // Status badge color
  const statusEl = document.getElementById('fi-status');
  statusEl.style.background = f.status === 'active' || f.status === 'en-route'
    ? 'var(--green)' : f.status === 'landed'
      ? 'var(--blue)' : f.status === 'cancelled'
        ? 'var(--red)' : 'var(--surface2)';
  statusEl.style.color = ['active', 'en-route', 'landed', 'cancelled'].includes(f.status) ? '#000' : 'var(--text)';

  // Demo notice
  const demoNotice = document.getElementById('fi-demo-notice');
  if (f.isDemo) {
    demoNotice.classList.remove('hidden');
  } else {
    demoNotice.classList.add('hidden');
  }

  flightInfoEl.classList.remove('hidden');
}

function renderPlan(plan) {
  // Summary
  document.getElementById('ps-direction').textContent = plan.summary.direction;
  document.getElementById('ps-total-brews').textContent = plan.summary.totalDryBrews;
  document.getElementById('ps-total-mg').textContent = `${plan.summary.totalCaffeineMg}mg`;
  document.getElementById('ps-days').textContent = plan.summary.totalDays;
  planSummaryEl.classList.remove('hidden');

  // Days
  planDaysEl.innerHTML = '';
  for (const day of plan.days) {
    const card = document.createElement('div');
    card.className = `day-card ${day.type}`;

    let html = `<div class="day-label">${day.label}</div>`;

    // Meta info
    html += '<div class="day-meta">';
    if (day.wake) html += `<span class="day-meta-item"><span class="meta-label">Wake:</span>${day.wake}</span>`;
    if (day.sleep) html += `<span class="day-meta-item"><span class="meta-label">Sleep:</span>${day.sleep}</span>`;
    if (day.departure) html += `<span class="day-meta-item"><span class="meta-label">Departs:</span>${day.departure}</span>`;
    if (day.arrival) html += `<span class="day-meta-item"><span class="meta-label">Arrives:</span>${day.arrival}</span>`;
    if (day.flightDuration) html += `<span class="day-meta-item"><span class="meta-label">Duration:</span>${day.flightDuration}</span>`;
    html += '</div>';

    // Caffeine window
    if (day.caffeineWindow) {
      html += `<div class="caffeine-window">Dry Brew window: ${day.caffeineWindow.start} — ${day.caffeineWindow.cutoff}</div>`;
    }

    // Flight day events
    if (day.events) {
      for (const ev of day.events) {
        const icon = ev.type === 'caffeine' ? '&#9749;' : '&#128564;';
        html += `<div class="event-note">${icon} ${ev.note}</div>`;
      }
    }

    // Pre-departure doses
    if (day.preDepartureDoses?.length > 0) {
      html += '<div class="section-label">Before departure</div>';
      html += renderDoseList(day.preDepartureDoses);
    }

    // In-flight doses
    if (day.inFlightDoses?.length > 0) {
      html += '<div class="section-label">During flight</div>';
      html += renderDoseList(day.inFlightDoses);
    }

    // Regular doses
    if (day.doses?.length > 0) {
      html += renderDoseList(day.doses);
    }

    // No doses message
    const totalDoses = (day.doses?.length || 0) + (day.preDepartureDoses?.length || 0) + (day.inFlightDoses?.length || 0);
    if (totalDoses === 0 && day.type !== 'flight') {
      html += '<p style="color: var(--text-dim); font-size: 0.9rem;">No Dry Brew this day — caffeine window is too narrow.</p>';
    }

    // Light advice
    if (day.lightAdvice) {
      html += `<div class="advice-box"><span class="advice-label">Light:</span>${day.lightAdvice}</div>`;
    }

    // Tip
    if (day.tip) {
      html += `<div class="tip">${day.tip}</div>`;
    }

    card.innerHTML = html;
    planDaysEl.appendChild(card);
  }

  planDaysEl.classList.remove('hidden');
}

function renderDoseList(doses) {
  let html = '<ul class="dose-list">';
  for (const d of doses) {
    html += `<li class="dose-item">
      <span class="dose-time">${d.time}</span>
      <span class="dose-icon">&#9749;</span>
      <span class="dose-label">${d.label}</span>
    </li>`;
  }
  html += '</ul>';
  return html;
}

async function loadDemos() {
  try {
    const res = await fetch('/api/demos');
    const data = await res.json();
    if (!data.ok || !data.demos.length) return;

    let html = '<span>Try a demo flight:</span><div class="demo-list">';
    for (const d of data.demos) {
      html += `<span class="demo-chip" data-code="${d.code}" title="${d.cities}">${d.code} (${d.route})</span>`;
    }
    html += '</div>';
    demoFlightsEl.innerHTML = html;

    demoFlightsEl.querySelectorAll('.demo-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        flightNumberInput.value = chip.dataset.code;
        form.dispatchEvent(new Event('submit'));
      });
    });
  } catch {
    // Ignore — demos are optional
  }
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.classList.add('hidden');
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const month = d.toLocaleString('en', { month: 'short' });
  return `${dh}:${m.toString().padStart(2, '0')} ${ampm}, ${month} ${d.getDate()}`;
}

function timeToDecimal(timeStr) {
  if (!timeStr) return 7;
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}
