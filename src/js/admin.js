import { simulator } from './data/simulation.js';
import Chart from 'chart.js/auto';

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const kpiAttendance = document.getElementById('kpi-attendance');
  const kpiDensity = document.getElementById('kpi-density');
  const kpiAlerts = document.getElementById('kpi-alerts');
  const alertsList = document.getElementById('alerts-list');
  const ctx = document.getElementById('predictionChart').getContext('2d');

  let activeAlerts = 2; // matching initial HTML

  // Init Chart
  const predictionChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['-50m', '-40m', '-30m', '-20m', '-10m', 'Now', '+10m', '+20m', '+30m', '+40m'],
      datasets: [{
        label: 'Avg Stadium Density',
        data: simulator.state.historicalDensity,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth: 1.5,
        pointRadius: 2,
        pointBackgroundColor: '#3b82f6',
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { 
          beginAtZero: true, 
          max: 1.0,
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });

  // Simulator Bindings
  simulator.on('update:predictions', (data) => {
    predictionChart.data.datasets[0].data = data;
    predictionChart.update();
    
    // Update overall density KPI
    const currentDensity = data[data.length - 1];
    let densityText = 'Low';
    if (currentDensity > 0.4) densityText = 'Moderate';
    if (currentDensity > 0.7) densityText = 'High';
    kpiDensity.textContent = densityText;
  });

  simulator.on('alert', (msg) => {
    activeAlerts++;
    kpiAlerts.textContent = activeAlerts;
    
    const li = document.createElement('li');
    li.className = 'alert-item warning';
    
    const now = new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    const msgSpan = document.createElement('span');
    msgSpan.className = 'msg';
    msgSpan.textContent = msg;

    li.appendChild(timeSpan);
    li.appendChild(msgSpan);
    
    alertsList.prepend(li);
    if (alertsList.children.length > 5) {
      alertsList.removeChild(alertsList.lastChild);
    }
  });
});
