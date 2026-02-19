// API Configuration
const API_BASE = 'https://api.coingecko.com/api/v3';
const REFRESH_INTERVAL = 30000; // 30 seconds
const TOP_COINS = 50;

// State Management
let allCoins = [];
let filteredCoins = [];
let favorites = JSON.parse(localStorage.getItem('cryptoFavorites')) || [];
let currentFilter = 'all';
let currentSort = 'market_cap';
let refreshTimer = null;
let previousPrices = {};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    fetchCryptoData();
    startAutoRefresh();
});

function initializeApp() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        document.getElementById('themeToggle').textContent = '☀️';
    }
}

function setupEventListeners() {
    // Theme Toggle
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    
    // Refresh Button
    document.getElementById('refreshBtn').addEventListener('click', () => {
        fetchCryptoData();
        showToast('Refreshing data...', 'success');
    });
    
    // Search
    document.getElementById('searchInput').addEventListener('input', handleSearch);
    
    // Filter Buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilter = e.target.dataset.filter;
            applyFilters();
        });
    });
    
    // Sort Select
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFilters();
    });
    
    // Modal Close
    document.querySelector('.modal-close').addEventListener('click', closeModal);
    document.getElementById('coinModal').addEventListener('click', (e) => {
        if (e.target.id === 'coinModal') closeModal();
    });
}

async function fetchCryptoData() {
    try {
        showLoading(true);
        
        const [marketData, globalData] = await Promise.all([
            fetch(`${API_BASE}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${TOP_COINS}&page=1&sparkline=true&price_change_percentage=24h`).then(r => r.json()),
            fetch(`${API_BASE}/global`).then(r => r.json())
        ]);
        
        allCoins = marketData;
        updateGlobalStats(globalData.data);
        applyFilters();
        showLoading(false);
        
    } catch (error) {
        console.error('Error fetching data:', error);
        showToast('Failed to fetch crypto data', 'error');
        showLoading(false);
    }
}

function updateGlobalStats(data) {
    animateValue('totalMarketCap', 0, data.total_market_cap.usd, 1000, formatCurrency);
    animateValue('totalVolume', 0, data.total_volume.usd, 1000, formatCurrency);
    animateValue('btcDominance', 0, data.market_cap_percentage.btc, 1000, (val) => val.toFixed(1) + '%');
    animateValue('activeCryptos', 0, data.active_cryptocurrencies, 1000, (val) => Math.floor(val).toLocaleString());
}

function applyFilters() {
    let coins = [...allCoins];
    
    // Apply filter
    switch(currentFilter) {
        case 'favorites':
            coins = coins.filter(coin => favorites.includes(coin.id));
            break;
        case 'gainers':
            coins = coins.filter(coin => coin.price_change_percentage_24h > 0)
                         .sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
                         .slice(0, 20);
            break;
        case 'losers':
            coins = coins.filter(coin => coin.price_change_percentage_24h < 0)
                         .sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
                         .slice(0, 20);
            break;
    }
    
    // Apply sort
    coins.sort((a, b) => {
        switch(currentSort) {
            case 'price':
                return b.current_price - a.current_price;
            case 'change':
                return b.price_change_percentage_24h - a.price_change_percentage_24h;
            case 'volume':
                return b.total_volume - a.total_volume;
            default:
                return b.market_cap - a.market_cap;
        }
    });
    
    filteredCoins = coins;
    renderCryptoGrid();
}

function handleSearch(e) {
    const query = e.target.value.toLowerCase();
    
    if (query === '') {
        applyFilters();
        return;
    }
    
    filteredCoins = allCoins.filter(coin => 
        coin.name.toLowerCase().includes(query) || 
        coin.symbol.toLowerCase().includes(query)
    );
    
    renderCryptoGrid();
}

function renderCryptoGrid() {
    const grid = document.getElementById('cryptoGrid');
    
    if (filteredCoins.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem; color: var(--text-secondary);">No cryptocurrencies found</div>';
        return;
    }
    
    grid.innerHTML = filteredCoins.map(coin => createCryptoCard(coin)).join('');
    
    // Add event listeners
    document.querySelectorAll('.crypto-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (!e.target.classList.contains('favorite-btn')) {
                openCoinModal(card.dataset.coinId);
            }
        });
    });
    
    document.querySelectorAll('.favorite-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.coinId);
        });
    });
}

function createCryptoCard(coin) {
    const priceChange = coin.price_change_percentage_24h || 0;
    const isPositive = priceChange >= 0;
    const isFavorite = favorites.includes(coin.id);
    const arrow = isPositive ? '↑' : '↓';
    
    // Check for significant price change
    if (previousPrices[coin.id]) {
        const priceDiff = Math.abs(coin.current_price - previousPrices[coin.id]);
        const percentDiff = (priceDiff / previousPrices[coin.id]) * 100;
        if (percentDiff > 5) {
            showToast(`${coin.symbol.toUpperCase()} ${isPositive ? 'surged' : 'dropped'} ${Math.abs(priceChange).toFixed(2)}%!`, isPositive ? 'success' : 'warning');
        }
    }
    previousPrices[coin.id] = coin.current_price;
    
    return `
        <div class="crypto-card" data-coin-id="${coin.id}">
            <div class="card-header">
                <div class="coin-info">
                    <img src="${coin.image}" alt="${coin.name}" class="coin-icon">
                    <div class="coin-name-group">
                        <div class="coin-name">${coin.name}</div>
                        <div class="coin-symbol">${coin.symbol}</div>
                    </div>
                </div>
                <button class="favorite-btn ${isFavorite ? 'active' : ''}" data-coin-id="${coin.id}">
                    ${isFavorite ? '⭐' : '☆'}
                </button>
            </div>
            
            <div class="card-body">
                <div class="price" data-price="${coin.current_price}">
                    ${formatCurrency(coin.current_price)}
                </div>
                <div class="price-change ${isPositive ? 'positive' : 'negative'}">
                    ${arrow} ${Math.abs(priceChange).toFixed(2)}%
                </div>
            </div>
            
            <div class="card-stats">
                <div class="stat-item">
                    <div class="stat-item-label">Market Cap</div>
                    <div class="stat-item-value">${formatLargeNumber(coin.market_cap)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">Volume 24h</div>
                    <div class="stat-item-value">${formatLargeNumber(coin.total_volume)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">Rank</div>
                    <div class="stat-item-value">#${coin.market_cap_rank}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-item-label">Supply</div>
                    <div class="stat-item-value">${formatLargeNumber(coin.circulating_supply)}</div>
                </div>
            </div>
            
            ${coin.sparkline_in_7d ? createSparkline(coin.sparkline_in_7d.price, isPositive) : ''}
        </div>
    `;
}

function createSparkline(prices, isPositive) {
    const width = 280;
    const height = 60;
    const max = Math.max(...prices);
    const min = Math.min(...prices);
    const range = max - min;
    
    const points = prices.map((price, i) => {
        const x = (i / (prices.length - 1)) * width;
        const y = height - ((price - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');
    
    const color = isPositive ? '#10b981' : '#ef4444';
    
    return `
        <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
            <polyline
                points="${points}"
                fill="none"
                stroke="${color}"
                stroke-width="2"
                opacity="0.8"
            />
            <polyline
                points="${points} ${width},${height} 0,${height}"
                fill="${color}"
                opacity="0.1"
            />
        </svg>
    `;
}

async function openCoinModal(coinId) {
    const modal = document.getElementById('coinModal');
    const modalBody = document.getElementById('modalBody');
    
    modal.classList.add('active');
    modalBody.innerHTML = '<div class="loading-screen"><div class="loader"></div></div>';
    
    try {
        const coin = await fetch(`${API_BASE}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false`).then(r => r.json());
        
        const priceChange = coin.market_data.price_change_percentage_24h || 0;
        const isPositive = priceChange >= 0;
        const arrow = isPositive ? '↑' : '↓';
        
        modalBody.innerHTML = `
            <div class="modal-header">
                <img src="${coin.image.large}" alt="${coin.name}" class="modal-coin-icon">
                <div class="modal-coin-info">
                    <h2>${coin.name}</h2>
                    <div class="coin-symbol">${coin.symbol.toUpperCase()} • Rank #${coin.market_cap_rank}</div>
                </div>
            </div>
            
            <div class="modal-price-section">
                <div class="modal-price">${formatCurrency(coin.market_data.current_price.usd)}</div>
                <div class="price-change ${isPositive ? 'positive' : 'negative'}">
                    ${arrow} ${Math.abs(priceChange).toFixed(2)}% (24h)
                </div>
            </div>
            
            <div class="modal-stats-grid">
                <div class="modal-stat-card">
                    <div class="stat-label">Market Cap</div>
                    <div class="stat-value">${formatCurrency(coin.market_data.market_cap.usd)}</div>
                </div>
                <div class="modal-stat-card">
                    <div class="stat-label">24h Volume</div>
                    <div class="stat-value">${formatCurrency(coin.market_data.total_volume.usd)}</div>
                </div>
                <div class="modal-stat-card">
                    <div class="stat-label">Circulating Supply</div>
                    <div class="stat-value">${formatLargeNumber(coin.market_data.circulating_supply)} ${coin.symbol.toUpperCase()}</div>
                </div>
                <div class="modal-stat-card">
                    <div class="stat-label">Total Supply</div>
                    <div class="stat-value">${coin.market_data.total_supply ? formatLargeNumber(coin.market_data.total_supply) : 'N/A'}</div>
                </div>
                <div class="modal-stat-card">
                    <div class="stat-label">All-Time High</div>
                    <div class="stat-value">${formatCurrency(coin.market_data.ath.usd)}</div>
                </div>
                <div class="modal-stat-card">
                    <div class="stat-label">All-Time Low</div>
                    <div class="stat-value">${formatCurrency(coin.market_data.atl.usd)}</div>
                </div>
            </div>
            
            ${coin.description.en ? `
                <div class="modal-description">
                    <h3 style="margin-bottom: 1rem;">About ${coin.name}</h3>
                    ${coin.description.en.split('. ').slice(0, 3).join('. ')}.
                </div>
            ` : ''}
            
            <div class="modal-links">
                ${coin.links.homepage[0] ? `<a href="${coin.links.homepage[0]}" target="_blank" class="modal-link">🌐 Website</a>` : ''}
                ${coin.links.blockchain_site[0] ? `<a href="${coin.links.blockchain_site[0]}" target="_blank" class="modal-link">🔗 Explorer</a>` : ''}
                ${coin.links.repos_url.github[0] ? `<a href="${coin.links.repos_url.github[0]}" target="_blank" class="modal-link">💻 GitHub</a>` : ''}
            </div>
        `;
    } catch (error) {
        modalBody.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Failed to load coin details</div>';
    }
}

function closeModal() {
    document.getElementById('coinModal').classList.remove('active');
}

function toggleFavorite(coinId) {
    const index = favorites.indexOf(coinId);
    
    if (index > -1) {
        favorites.splice(index, 1);
        showToast('Removed from favorites', 'success');
    } else {
        favorites.push(coinId);
        showToast('Added to favorites', 'success');
    }
    
    localStorage.setItem('cryptoFavorites', JSON.stringify(favorites));
    renderCryptoGrid();
}

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('themeToggle');
    
    body.classList.toggle('light-theme');
    
    if (body.classList.contains('light-theme')) {
        themeBtn.textContent = '☀️';
        localStorage.setItem('theme', 'light');
    } else {
        themeBtn.textContent = '🌙';
        localStorage.setItem('theme', 'dark');
    }
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠'
    };
    
    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-message">${message}</div>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showLoading(show) {
    document.getElementById('loadingScreen').style.display = show ? 'flex' : 'none';
    document.getElementById('cryptoGrid').style.display = show ? 'none' : 'grid';
}

function startAutoRefresh() {
    refreshTimer = setInterval(() => {
        fetchCryptoData();
    }, REFRESH_INTERVAL);
}

function animateValue(elementId, start, end, duration, formatter) {
    const element = document.getElementById(elementId);
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOutQuart = 1 - Math.pow(1 - progress, 4);
        const current = start + (end - start) * easeOutQuart;
        
        element.textContent = formatter(current);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function formatCurrency(value) {
    if (value >= 1) {
        return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else if (value >= 0.01) {
        return '$' + value.toFixed(4);
    } else {
        return '$' + value.toFixed(8);
    }
}

function formatLargeNumber(value) {
    if (!value) return 'N/A';
    
    if (value >= 1e12) {
        return '$' + (value / 1e12).toFixed(2) + 'T';
    } else if (value >= 1e9) {
        return '$' + (value / 1e9).toFixed(2) + 'B';
    } else if (value >= 1e6) {
        return '$' + (value / 1e6).toFixed(2) + 'M';
    } else if (value >= 1e3) {
        return '$' + (value / 1e3).toFixed(2) + 'K';
    }
    
    return '$' + value.toFixed(2);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (refreshTimer) clearInterval(refreshTimer);
});
