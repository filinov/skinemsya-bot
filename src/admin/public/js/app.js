// Utility functions
const formatAmount = (amount, currency = 'RUB') => {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount || 0);
};

const formatDate = (ts) => {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

// State
const state = {
    charts: {},
};

const api = {
    async get(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    },
    async post(url) {
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error(`API Error: ${res.status}`);
        return res.json();
    }
};

const render = {
    stats(data) {
        document.getElementById('stat-users-total').textContent = data.users.total;
        document.getElementById('stat-users-active').textContent = `Active 24h: ${data.users.active24h}`;

        document.getElementById('stat-pools-open').textContent = data.pools.open;
        document.getElementById('stat-pools-closed').textContent = `Closed: ${data.pools.closed}`;

        document.getElementById('stat-money-paid').textContent = formatAmount(data.money.paidTotal);
        document.getElementById('stat-money-percent').textContent = `${data.money.completionPercent}%`;
        document.getElementById('stat-money-progress').style.width = `${data.money.completionPercent}%`;

        document.getElementById('stat-participants-confirmed').textContent = data.participants.confirmed;
        document.getElementById('stat-participants-marked').textContent = `Verify: ${data.participants.marked}`;

        document.getElementById('lastUpdated').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    },

    pools(list) {
        const tbody = document.getElementById('poolsTableBody');
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; opacity:0.5;">Нет данных</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(pool => {
            const amount = pool.amountType === 'per_person'
                ? `${formatAmount(pool.perPersonAmount)} / чел`
                : formatAmount(pool.totalAmount);

            const statusClass = pool.isClosed ? 'chip--danger' : 'chip--success';
            const statusText = pool.isClosed ? 'Closed' : 'Open';
            const btnText = pool.isClosed ? 'Открыть' : 'Закрыть';

            return `
        <tr>
          <td style="font-weight:600">${pool.title}</td>
          <td style="color: var(--text-muted); font-size:12px">${pool.amountType}</td>
          <td>${amount}</td>
          <td><span class="chip ${statusClass}">${statusText}</span></td>
          <td>
            <button class="btn" onclick="app.togglePool('${pool.id}')">${btnText}</button>
          </td>
        </tr>
      `;
        }).join('');
    },

    users(list) {
        const tbody = document.getElementById('usersTableBody');
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; opacity:0.5;">Нет данных</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(u => `
      <tr>
        <td>${u.firstName || ''} ${u.lastName || ''}</td>
        <td style="color:var(--accent-primary)">${u.username ? '@' + u.username : '—'}</td>
        <td style="font-size:12px; color:var(--text-muted)">${formatDate(u.lastSeenAt)}</td>
      </tr>
    `).join('');
    },

    charts(data) {
        // Activity Chart
        const ctxActivity = document.getElementById('chartActivity').getContext('2d');
        if (state.charts.activity) state.charts.activity.destroy();

        state.charts.activity = new Chart(ctxActivity, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Сборы',
                        data: data.pools,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Пользователи',
                        data: data.users,
                        borderColor: '#10b981',
                        backgroundColor: 'transparent',
                        tension: 0.4
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { labels: { color: '#94a3b8' } } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });

        // Finance Chart
        const ctxFinance = document.getElementById('chartFinance').getContext('2d');
        if (state.charts.finance) state.charts.finance.destroy();

        state.charts.finance = new Chart(ctxFinance, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'Оплаты',
                    data: data.paid,
                    backgroundColor: '#8b5cf6',
                    borderRadius: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                    x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                }
            }
        });
    }
};

const app = {
    async init() {
        await this.refresh();
    },

    async refresh() {
        try {
            const [statsData, poolsData, usersData, timelineData] = await Promise.all([
                api.get('/admin/api/stats'),
                api.get('/admin/api/pools'),
                api.get('/admin/api/users'),
                api.get('/admin/api/timeline')
            ]);

            if (statsData.ok) render.stats(statsData.stats);
            if (poolsData.ok) render.pools(poolsData.pools);
            if (usersData.ok) render.users(usersData.users);
            if (timelineData.ok) render.charts(timelineData.timeline);

        } catch (e) {
            console.error('Failed to load data', e);
            // Optional: Show toast error
        }
    },

    async togglePool(id) {
        if (!confirm('Are you sure you want to change pool status?')) return;
        try {
            await api.post(`/admin/api/pools/${id}/toggle`);
            await this.refresh(); // Reload to show updated state
        } catch (e) {
            alert('Failed to toggle pool');
        }
    }
};

window.app = app;
app.init();
