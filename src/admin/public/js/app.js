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

        document.getElementById('stat-pools-total').textContent = data.pools.total;
        document.getElementById('stat-pools-new').textContent = `New 24h: ${data.pools.new24h}`;

        document.getElementById('stat-activity-transactions').textContent = data.activity.transactionsTotal;
        document.getElementById('stat-activity-24h').textContent = `24h: ${data.activity.transactions24h}`;

        document.getElementById('stat-participants-total').textContent = data.activity.participantsTotal;

        document.getElementById('lastUpdated').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
    },

    pools(list) {
        const tbody = document.getElementById('poolsTableBody');
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; opacity:0.5;">Нет данных</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(pool => {
            const statusClass = pool.isClosed ? 'chip--danger' : 'chip--success';
            const statusText = pool.isClosed ? 'Closed' : 'Open';
            const btnText = pool.isClosed ? 'Открыть' : 'Закрыть';

            return `
        <tr>
          <td style="font-weight:600">${pool.title}</td>
          <td style="color: var(--text-muted); font-size:12px">${formatDate(pool.createdAt)}</td>
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
        // Users Chart (Retention/Growth)
        const ctxUsers = document.getElementById('chartUsers').getContext('2d');
        if (state.charts.users) state.charts.users.destroy();

        state.charts.users = new Chart(ctxUsers, {
            type: 'line',
            data: {
                labels: data.labels,
                datasets: [
                    {
                        label: 'Total Users',
                        data: data.users,
                        borderColor: '#3b82f6',
                        backgroundColor: 'transparent',
                        tension: 0.4
                    },
                    {
                        label: 'Active Users (DAU)',
                        data: data.active,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
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

        // Pools Chart (Creation Volume)
        const ctxPools = document.getElementById('chartPools').getContext('2d');
        if (state.charts.pools) state.charts.pools.destroy();

        state.charts.pools = new Chart(ctxPools, {
            type: 'bar',
            data: {
                labels: data.labels,
                datasets: [{
                    label: 'New Pools',
                    data: data.pools,
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
        }
    },

    async togglePool(id) {
        if (!confirm('Change pool status?')) return;
        try {
            await api.post(`/admin/api/pools/${id}/toggle`);
            await this.refresh();
        } catch (e) {
            alert('Failed to toggle pool');
        }
    }
};

window.app = app;
app.init();
