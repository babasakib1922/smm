/**
 * Engagement Component — Campaign Scheduler & Batch Delivery Planner
 * Replaces previous Engagement view with the full Campaign Scheduler interface
 * Implements organic randomized batch pacing matching reference design exactly
 */

window.EngagementComponent = {
  packages: [],
  selectedPackage: null,
  currentSchedule: null,
  originalSchedule: null,
  isShuffled: false,
  isExpanded: false,
  mappings: [],
  totalLikes: 41,
  likesWaves: 3,
  totalSaves: 0,
  savesWaves: 0,
  totalReposts: 0,
  repostsWaves: 0,
  totalShares: 0,
  sharesWaves: 0,

  // Fallback defaults for the 4 growth tiers
  tierDefaults: {
    1: {
      name: 'TikTok 1st Working 2K',
      displayName: '~2,960 Views',
      badgeText: '5.0 HOURS',
      subtitle: 'Calibrated 5-Hour Organic Pacing for Starter Posts',
      features: ['Views', 'Likes'],
      totalQuantity: 2000,
      totalBatches: 16,
      intervalMinutes: 20,
      campaignWindowHours: 5,
      defaultLikes: 41,
      likesWaves: 3,
      defaultSaves: 0,
      savesWaves: 0,
      defaultReposts: 0,
      repostsWaves: 0
    },
    2: {
      name: 'TikTok Organic Velocity 5K',
      displayName: '~5,100 Views',
      badgeText: '1 DAY (16H)',
      subtitle: '1-Day FYP Momentum with Smooth Co-Delivered Views, Likes, Saves & Reposts',
      features: ['Views', 'Likes', 'Saves', 'Reposts'],
      totalQuantity: 5150,
      totalBatches: 20,
      intervalMinutes: 45,
      campaignWindowHours: 16,
      defaultLikes: 179,
      likesWaves: 14,
      defaultSaves: 41,
      savesWaves: 4,
      defaultReposts: 23,
      repostsWaves: 2
    },
    3: {
      name: 'TikTok FYP Breakthrough 10K',
      displayName: '~10,600 Views',
      badgeText: '1 DAY (22H)',
      subtitle: 'Full 24-Hour Virality with High-Retention Saves & Reposts',
      features: ['Views', 'Likes', 'Saves', 'Reposts'],
      totalQuantity: 10590,
      totalBatches: 26,
      intervalMinutes: 48,
      campaignWindowHours: 22,
      defaultLikes: 381,
      likesWaves: 24,
      defaultSaves: 94,
      savesWaves: 8,
      defaultShares: 46,
      sharesWaves: 4,
      defaultReposts: 42,
      repostsWaves: 4
    },
    4: {
      name: 'TikTok Viral Mega 50K',
      displayName: '~50,700 Views',
      badgeText: '2 DAYS (48H)',
      subtitle: '2-Day (48-Hour) Full Viral Simulation across International Timezones',
      features: ['Views', 'Likes', 'Saves', 'Reposts', 'Shares'],
      totalQuantity: 50694,
      totalBatches: 44,
      intervalMinutes: 62,
      campaignWindowHours: 48,
      defaultLikes: 2028,
      likesWaves: 40,
      defaultSaves: 443,
      savesWaves: 30,
      defaultShares: 176,
      sharesWaves: 15,
      defaultReposts: 176,
      repostsWaves: 11
    }
  },

  isSlotEnabled(type) {
    const m = (this.mappings || []).find(x => x.service_type === type);
    return m ? m.is_enabled === 1 : (type === 'views' || type === 'likes');
  },

  async render(container) {
    container.innerHTML = '<div style="text-align: center; padding: 50px; font-size: 15px; color: var(--text-muted);">Loading Growth Tier Planner...</div>';

    // 1. Fetch configurable packages and user automation service mappings
    const [res, mapRes] = await Promise.all([
      API.get('/api/scheduler/packages'),
      API.get('/api/services/user-mappings')
    ]);

    if (!res.success) {
      container.innerHTML = `<div class="glass-panel" style="padding: 24px; color: var(--color-danger);">Failed to load packages: ${res.error}</div>`;
      return;
    }

    this.packages = res.packages || [];
    this.mappings = (mapRes && mapRes.success) ? mapRes.mappings || [] : [];

    // Ensure 4 packages exist and merge tier defaults if needed
    if (this.packages.length === 0) {
      this.packages = Object.values(this.tierDefaults).map((d, i) => ({ id: i + 1, ...d }));
    }

    // Default to Tier 1 if none selected yet
    if (!this.selectedPackage && this.packages.length > 0) {
      this.selectedPackage = this.packages[0];
      this.syncMetricsFromPackage(this.selectedPackage);
    }

    const html = `
      <div style="max-width: 1200px; margin: 0 auto;">
        
        <!-- Choose Growth Tier Section Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">✨</span>
            <h3 style="font-size: 18px; font-weight: 700; color: #000000; margin: 0; letter-spacing: -0.3px;">Choose Growth Tier</h3>
          </div>
          <div style="font-size: 13px; color: var(--text-muted);">
            Safe algorithmic pacing
          </div>
        </div>

        <!-- 4 Growth Tier Cards Grid -->
        <div id="tier-cards-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-bottom: 24px;"></div>

        <!-- Section 1: TikTok Video URL Card -->
        <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 22px 26px; margin-bottom: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 26px; height: 26px; border-radius: 50%; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 13px; display: flex; align-items: center; justify-content: center;">
                1
              </div>
              <h4 style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 0;">TikTok Video URL</h4>
            </div>
            <div style="font-size: 12px; color: #64748b; font-weight: 500;">
              Public post link
            </div>
          </div>
          <input type="url" id="sched-target-url" placeholder="https://www.tiktok.com/@username/video/..." 
                 style="width: 100%; padding: 13px 18px; border-radius: 12px; border: 1.5px solid #cbd5e1; font-size: 14px; font-family: monospace, sans-serif; background: #ffffff; color: #0f172a; outline: none; transition: border-color 0.2s;"
                 onfocus="this.style.borderColor='#2563eb';"
                 onblur="this.style.borderColor='#cbd5e1';">
        </div>

        <!-- Section 2: Schedule & Delivery Breakdown Card -->
        <div id="breakdown-card-container" style="margin-bottom: 24px;"></div>

        <!-- Action Toolbar -->
        <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 24px; margin-bottom: 32px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);">
          <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
            <button id="sched-save-btn" class="btn btn-primary" style="padding: 11px 24px; font-weight: 700; font-size: 14px; border-radius: 10px; display: flex; align-items: center; gap: 8px;">
              🚀 Launch Campaign Now
            </button>
            <button id="sched-shuffle-toolbar-btn" type="button" class="btn btn-secondary" style="padding: 11px 20px; font-weight: 700; font-size: 14px; border-radius: 10px; display: flex; align-items: center; gap: 8px; background: #eff6ff; color: #2563eb; border: 1.5px solid #bfdbfe; cursor: pointer;">
              🔀 Shuffle Plan
            </button>
            <button id="sched-share-btn" class="btn btn-secondary" style="padding: 10px 18px; font-size: 13px; border-radius: 10px; display: flex; align-items: center; gap: 6px;">
              🔗 Share Plan
            </button>
            <button id="sched-copy-btn" class="btn btn-secondary" style="padding: 10px 18px; font-size: 13px; border-radius: 10px; display: flex; align-items: center; gap: 6px;">
              📋 Copy Schedule
            </button>
            <button id="sched-details-btn" class="btn btn-secondary" style="padding: 10px 18px; font-size: 13px; border-radius: 10px; display: flex; align-items: center; gap: 6px;">
              🔍 View Details
            </button>
          </div>
          <div style="font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 8px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #10b981;"></span>
            <span>Instant Launch (No delay)</span>
            <span style="opacity: 0.5;">•</span>
            <span>Drip Queue: 1 check/min</span>
          </div>
        </div>

        <!-- User Active Campaigns & History -->
        <div class="glass-panel" style="padding: 24px; border-radius: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="font-size: 16px; font-weight: 700; margin: 0;">Your Active Campaigns</h3>
            <button class="btn btn-secondary btn-sm" onclick="EngagementComponent.loadUserCampaigns()">🔄 Refresh Campaigns</button>
          </div>
          <div id="sched-campaigns-list">
            <div style="text-align: center; padding: 20px; color: var(--text-dim);">Loading registered campaigns...</div>
          </div>
        </div>

      </div>
    `;

    container.innerHTML = html;

    // Render Growth Tier Cards
    this.renderTierCards();

    // Attach all event listeners
    this.initEvents();

    // Calculate initial schedule
    await this.calculateSchedule();

    // Load user's registered campaigns
    await this.loadUserCampaigns();
  },

  syncMetricsFromPackage(pkg) {
    if (!pkg) return;
    const defaults = this.tierDefaults[pkg.id] || {};
    this.totalQuantity = pkg.total_quantity || defaults.totalQuantity || 2000;
    this.totalLikes = pkg.default_likes !== undefined ? pkg.default_likes : (defaults.defaultLikes || 0);
    this.likesWaves = pkg.likes_waves !== undefined ? pkg.likes_waves : (defaults.likesWaves || 0);
    this.totalSaves = pkg.default_saves !== undefined ? pkg.default_saves : (defaults.defaultSaves || 0);
    this.savesWaves = pkg.saves_waves !== undefined ? pkg.saves_waves : (defaults.savesWaves || 0);
    this.totalReposts = pkg.default_reposts !== undefined ? pkg.default_reposts : (defaults.defaultReposts || 0);
    this.repostsWaves = pkg.reposts_waves !== undefined ? pkg.reposts_waves : (defaults.repostsWaves || 0);
    this.totalShares = pkg.default_shares !== undefined ? pkg.default_shares : (defaults.defaultShares || 0);
    this.sharesWaves = pkg.shares_waves !== undefined ? pkg.shares_waves : (defaults.sharesWaves || 0);
  },

  renderTierCards() {
    const grid = document.getElementById('tier-cards-grid');
    if (!grid) return;

    grid.innerHTML = this.packages.map(p => {
      const def = this.tierDefaults[p.id] || {};
      const isSelected = this.selectedPackage && this.selectedPackage.id === p.id;
      const title = p.name || def.name;
      const badgeText = p.badge_text || def.badgeText || `${p.campaign_window_hours}.0 HOURS`;
      const subtitle = p.subtitle || def.subtitle || `${p.campaign_window_hours}-Hour Organic Pacing`;
      const displayViews = p.display_name || def.displayName || `~${(p.total_quantity || 2000).toLocaleString()} Views`;
      const batchesText = `${p.total_batches || def.totalBatches} Batches`;

      const features = (p.features ? p.features.split(',') : (def.features || ['Views', 'Likes'])).map(f => f.trim().toLowerCase());

      return `
        <div class="growth-tier-card" data-pkg-id="${p.id}"
             style="background: #ffffff; border: ${isSelected ? '2px solid #2563eb' : '1.5px solid #e2e8f0'}; border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: ${isSelected ? '0 4px 14px rgba(37, 99, 235, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)'}; display: flex; flex-direction: column; justify-content: space-between;"
             onmouseover="if (!${isSelected}) { this.style.borderColor='#93c5fd'; this.style.transform='translateY(-2px)'; }"
             onmouseout="if (!${isSelected}) { this.style.borderColor='#e2e8f0'; this.style.transform='none'; }">
          
          <div>
            <!-- Top Row: Title + Badge -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
              <h4 style="font-size: 15px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3;">
                ${title}
              </h4>
              <span style="${isSelected ? 'background: #2563eb; color: #ffffff;' : 'background: #f1f5f9; color: #475569;'} font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 12px; white-space: nowrap; margin-left: 8px;">
                ${badgeText}
              </span>
            </div>

            <!-- Subtitle -->
            <p style="font-size: 12px; color: #64748b; margin: 0 0 14px 0; min-height: 32px; line-height: 1.35;">
              ${subtitle}
            </p>

            <!-- Feature Pills -->
            <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px;">
              <span style="background: #eff6ff; color: #2563eb; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;">Views</span>
              <span style="background: #fff1f2; color: #e11d48; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;">Likes</span>
              ${features.includes('saves') ? `
                <span style="background: #fef3c7; color: #d97706; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;">Saves</span>
              ` : ''}
              ${features.includes('shares') ? `
                <span style="background: #ecfeff; color: #0891b2; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;">Shares</span>
              ` : ''}
              ${features.includes('reposts') ? `
                <span style="background: #f5f3ff; color: #7c3aed; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px;">Reposts</span>
              ` : ''}
            </div>
          </div>

          <!-- Bottom Row: Display Views & Batches -->
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 10px; border-top: 1px solid #f1f5f9;">
            <span style="font-size: 13px; font-weight: 800; color: #2563eb;">
              ${displayViews}
            </span>
            <span style="font-size: 12px; color: #64748b; font-weight: 500;">
              ${batchesText}
            </span>
          </div>

        </div>
      `;
    }).join('');

    // Attach click events on tier cards
    grid.querySelectorAll('.growth-tier-card').forEach(card => {
      card.addEventListener('click', () => {
        const pkgId = parseInt(card.getAttribute('data-pkg-id'), 10);
        this.selectPackage(pkgId);
      });
    });
  },

  selectPackage(pkgId) {
    this.selectedPackage = this.packages.find(p => p.id === pkgId);
    if (!this.selectedPackage) return;

    this.isShuffled = false;
    this.originalSchedule = null;

    // Sync metrics from package
    this.syncMetricsFromPackage(this.selectedPackage);

    // Re-render tier cards to update active border and badge
    this.renderTierCards();

    // Recalculate schedule
    this.calculateSchedule();
  },

  initEvents() {
    // Save Plan Button
    const saveBtn = document.getElementById('sched-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.savePlan());
    }

    // Shuffle Plan Button (Action Toolbar)
    const shuffleToolbarBtn = document.getElementById('sched-shuffle-toolbar-btn');
    if (shuffleToolbarBtn) {
      shuffleToolbarBtn.addEventListener('click', () => this.shufflePlan());
    }

    // Share Plan Button
    const shareBtn = document.getElementById('sched-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.sharePlan());
    }

    // Copy Schedule Button
    const copyBtn = document.getElementById('sched-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => this.copySchedule());
    }

    // View Schedule Details Button
    const detailsBtn = document.getElementById('sched-details-btn');
    if (detailsBtn) {
      detailsBtn.addEventListener('click', () => this.viewScheduleDetails());
    }
  },

  async calculateSchedule(customQuantities = null) {
    if (!this.selectedPackage) return;

    const res = await API.post('/api/scheduler/calculate', {
      packageId: this.selectedPackage.id,
      startTime: new Date().toISOString(),
      customQuantities,
      totalQuantity: this.totalQuantity,
      totalLikes: this.totalLikes,
      likesWaves: this.likesWaves,
      totalSaves: this.totalSaves,
      savesWaves: this.savesWaves,
      totalReposts: this.totalReposts,
      repostsWaves: this.repostsWaves,
      totalShares: this.totalShares,
      sharesWaves: this.sharesWaves
    });

    if (res.success) {
      this.currentSchedule = res.schedule;
      if (!customQuantities && !this.isShuffled) {
        this.originalSchedule = JSON.parse(JSON.stringify(res.schedule));
      }
      this.renderBreakdownCard();
    } else {
      API.showToast(res.error || 'Failed to calculate schedule', 'error');
    }
  },

  async shufflePlan() {
    if (!this.selectedPackage) return;

    const res = await API.post('/api/scheduler/shuffle', {
      packageId: this.selectedPackage.id,
      startTime: new Date().toISOString(),
      totalQuantity: this.totalQuantity,
      totalLikes: this.totalLikes,
      likesWaves: this.likesWaves,
      totalSaves: this.totalSaves,
      savesWaves: this.savesWaves,
      totalReposts: this.totalReposts,
      repostsWaves: this.repostsWaves,
      totalShares: this.totalShares,
      sharesWaves: this.sharesWaves
    });

    if (res.success) {
      this.currentSchedule = res.schedule;
      this.isShuffled = true;
      API.showToast('Schedule reshuffled! New randomized organic pacing applied.', 'info');
      this.renderBreakdownCard();
    } else {
      API.showToast(res.error || 'Failed to shuffle schedule', 'error');
    }
  },

  toggleExpand() {
    this.isExpanded = !this.isExpanded;
    this.renderBreakdownCard();
  },

  renderBreakdownCard() {
    const container = document.getElementById('breakdown-card-container');
    if (!container || !this.currentSchedule || !this.selectedPackage) return;

    const s = this.currentSchedule;
    const packageName = this.selectedPackage.name;
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const tzAbbr = userTimezone.includes('Dhaka') ? 'BD' : (userTimezone.includes('New_York') ? 'EDT' : 'UTC');

    const totalViews = s.totalQuantity.toLocaleString();
    const batchesCount = s.totalBatches;
    const durationHours = `${s.campaignWindowHours} Hours`;

    // Batches slice (show 8 if collapsed, all if expanded)
    const displayBatches = this.isExpanded ? s.batches : s.batches.slice(0, 8);
    const hasMore = s.batches.length > 8;

    container.innerHTML = `
      <div style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 26px 28px; color: #0f172a; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);">
        
        <!-- Top Header Row -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
          <div style="display: flex; align-items: flex-start; gap: 12px;">
            <div style="width: 28px; height: 28px; border-radius: 50%; background: #2563eb; color: #ffffff; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
              2
            </div>
            <div>
              <h3 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0; line-height: 1.3;">
                Schedule & Delivery Breakdown (${packageName})
              </h3>
              <p style="font-size: 13px; color: #64748b; margin: 3px 0 0 0;">
                Organic randomized pacing across ${durationHours}
              </p>
            </div>
          </div>

          <div>
            <button id="card-shuffle-btn" type="button" 
                    style="background: #ffffff; border: 1.5px solid #cbd5e1; color: #2563eb; font-weight: 600; font-size: 13px; padding: 7px 18px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 7px; transition: all 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.04);"
                    onmouseover="this.style.borderColor='#2563eb'; this.style.background='#eff6ff';"
                    onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='#ffffff';">
              <span style="font-size: 14px; margin-right: 6px;">🔀</span> Shuffle Plan
            </button>
          </div>
        </div>

        <!-- 5-6 Metric Summary Bar -->
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 24px; margin-bottom: 22px; display: grid; grid-template-columns: repeat(${(s.totalShares || 0) > 0 ? 6 : 5}, 1fr); gap: 14px;">
          <!-- VIEWS -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">VIEWS</div>
            <div style="font-size: 22px; font-weight: 800; color: #2563eb; margin: 3px 0;">${totalViews}</div>
            <div style="font-size: 12px; color: #64748b;">${batchesCount} batches</div>
          </div>

          <!-- LIKES -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">LIKES</div>
            <div style="font-size: 22px; font-weight: 800; color: #e11d48; margin: 3px 0;">${(s.totalLikes || 0) > 0 ? s.totalLikes : '—'}</div>
            <div style="font-size: 12px; color: #64748b;">${(s.totalLikes || 0) > 0 ? `${s.likesWaves} waves` : (this.isSlotEnabled('likes') ? 'Turned Off' : 'Disabled')}</div>
          </div>

          <!-- SAVES -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">SAVES</div>
            <div style="font-size: 22px; font-weight: 800; color: ${(s.totalSaves || 0) > 0 ? '#d97706' : '#94a3b8'}; margin: 3px 0;">${(s.totalSaves || 0) > 0 ? s.totalSaves : '—'}</div>
            <div style="font-size: 12px; color: #64748b;">${(s.totalSaves || 0) > 0 ? `${s.savesWaves} waves` : (this.isSlotEnabled('saves') ? 'Turned Off' : 'Disabled')}</div>
          </div>

          ${(s.totalShares || 0) > 0 ? `
            <!-- SHARES -->
            <div>
              <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">SHARES</div>
              <div style="font-size: 22px; font-weight: 800; color: #0891b2; margin: 3px 0;">${s.totalShares}</div>
              <div style="font-size: 12px; color: #64748b;">${s.sharesWaves} waves</div>
            </div>
          ` : ''}

          <!-- REPOSTS -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">REPOSTS</div>
            <div style="font-size: 22px; font-weight: 800; color: ${(s.totalReposts || 0) > 0 ? '#7c3aed' : '#94a3b8'}; margin: 3px 0;">${(s.totalReposts || 0) > 0 ? s.totalReposts : '—'}</div>
            <div style="font-size: 12px; color: #64748b;">${(s.totalReposts || 0) > 0 ? `${s.repostsWaves} waves` : (this.isSlotEnabled('reposts') ? 'Turned Off' : 'Disabled')}</div>
          </div>

          <!-- DURATION -->
          <div>
            <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">DURATION</div>
            <div style="font-size: 22px; font-weight: 800; color: #059669; margin: 3px 0;">${durationHours}</div>
            <div style="font-size: 12px; color: #64748b;">Human Pacing</div>
          </div>
        </div>

        <!-- Individual Batch Rows -->
        <div style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
          ${displayBatches.map(b => {
            const dateObj = new Date(b.scheduledAt);
            const timeStr = dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

            return `
              <div style="padding: 13px 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; transition: background 0.15s ease;"
                   onmouseover="this.style.background='#f8fafc';"
                   onmouseout="this.style.background='#ffffff';">
                
                <!-- Left: Batch # + Relative Time + Clock Time -->
                <div style="display: flex; align-items: center; gap: 14px;">
                  <span style="font-weight: 700; color: #0f172a; width: 32px; font-size: 13px;">#${b.batchNumber}</span>
                  <div style="font-size: 13px;">
                    <strong style="color: #0f172a; font-weight: 700;">${b.relativeTimeText}</strong>
                    <span style="color: #64748b; font-size: 12px; margin-left: 6px;">(${timeStr} ${tzAbbr})</span>
                  </div>
                </div>

                <!-- Right: Quantity Badges (Views & optional Likes/Saves/Reposts/Shares waves) -->
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span style="background: #eff6ff; color: #2563eb; font-weight: 700; font-size: 12px; padding: 4px 14px; border-radius: 16px; border: 1px solid #bfdbfe; display: inline-flex; align-items: center;">
                    ${b.plannedQuantity} views
                  </span>

                  ${b.likesQuantity > 0 ? `
                    <span style="background: #fff1f2; color: #e11d48; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 16px; border: 1px solid #fecdd3; display: inline-flex; align-items: center; gap: 4px;">
                      ❤️ +${b.likesQuantity} likes
                    </span>
                  ` : ''}

                  ${b.savesQuantity > 0 ? `
                    <span style="background: #fef3c7; color: #d97706; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 16px; border: 1px solid #fde68a; display: inline-flex; align-items: center; gap: 4px;">
                      💾 +${b.savesQuantity} saves
                    </span>
                  ` : ''}

                  ${b.repostsQuantity > 0 ? `
                    <span style="background: #f5f3ff; color: #7c3aed; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 16px; border: 1px solid #ddd6fe; display: inline-flex; align-items: center; gap: 4px;">
                      🔁 +${b.repostsQuantity} reposts
                    </span>
                  ` : ''}

                  ${b.sharesQuantity > 0 ? `
                    <span style="background: #ecfeff; color: #0891b2; font-weight: 700; font-size: 12px; padding: 4px 12px; border-radius: 16px; border: 1px solid #a5f3fc; display: inline-flex; align-items: center; gap: 4px;">
                      ↗️ +${b.sharesQuantity} shares
                    </span>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('')}

          <!-- Expand / Collapse Footer -->
          ${hasMore ? `
            <div id="card-expand-toggle" 
                 style="padding: 12px; text-align: center; font-size: 12px; font-weight: 700; color: #2563eb; cursor: pointer; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center; gap: 6px;"
                 onmouseover="this.style.background='#eff6ff';"
                 onmouseout="this.style.background='#f8fafc';">
              <span>${this.isExpanded ? '▲ Show Less' : `▼ Show All (${s.batches.length} Batches)`}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // Attach card shuffle button listener
    const cardShuffle = document.getElementById('card-shuffle-btn');
    if (cardShuffle) {
      cardShuffle.addEventListener('click', (e) => {
        e.preventDefault();
        this.shufflePlan();
      });
    }

    // Attach expand toggle listener
    const expandToggle = document.getElementById('card-expand-toggle');
    if (expandToggle) {
      expandToggle.addEventListener('click', () => {
        this.toggleExpand();
      });
    }
  },

  async savePlan() {
    const targetUrlInput = document.getElementById('sched-target-url');
    const targetUrl = targetUrlInput ? targetUrlInput.value.trim() : '';
    const startTime = new Date().toISOString(); // Starts immediately when order is placed

    if (!targetUrl) {
      API.showToast('Please enter a target TikTok Video URL.', 'error');
      if (targetUrlInput) targetUrlInput.focus();
      return;
    }

    if (!/^https?:\/\/.+/i.test(targetUrl)) {
      API.showToast('Target URL must be a valid http:// or https:// link.', 'error');
      if (targetUrlInput) targetUrlInput.focus();
      return;
    }

    if (!this.selectedPackage) {
      API.showToast('Please select a growth package first.', 'error');
      return;
    }

    const customQuantities = this.currentSchedule
      ? this.currentSchedule.batches.map(b => b.plannedQuantity)
      : null;

    API.showToast('Launching campaign batches into automated delivery queue...', 'info');

    const res = await API.post('/api/scheduler/campaigns', {
      name: `${this.selectedPackage.name} - Instant Campaign`,
      packageId: this.selectedPackage.id,
      serviceId: this.selectedPackage.service_id,
      targetUrl,
      startTime,
      customQuantities,
      totalLikes: this.totalLikes,
      likesWaves: this.likesWaves,
      totalSaves: this.totalSaves,
      savesWaves: this.savesWaves,
      totalReposts: this.totalReposts,
      repostsWaves: this.repostsWaves,
      totalShares: this.totalShares,
      sharesWaves: this.sharesWaves
    });

    if (res.success) {
      API.showToast(`Campaign launched! Registered ${this.selectedPackage.total_batches} batches with organic pacing.`, 'success');
      await this.loadUserCampaigns();
      this.showSaveSuccessModal(res.campaignId, res.shareToken);
    } else {
      API.showToast(res.error || 'Failed to launch campaign plan.', 'error');
    }
  },

  showSaveSuccessModal(campaignId, shareToken) {
    const shareUrl = `${window.location.origin}/#share-${shareToken}`;
    App.showModal(`
      <div class="modal-header">
        <h3>Campaign Launched Successfully</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="font-size: 14px; margin-bottom: 20px;">
        <div style="display: flex; align-items: center; gap: 8px; color: var(--color-success); font-weight: 700; margin-bottom: 12px;">
          <span>✓</span>
          <span>Campaign #${campaignId} has been saved and queued for automatic delivery.</span>
        </div>

        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
          All batches with randomized organic pacing are stored in the database and monitored by the 1-minute drip queue.
        </p>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Shareable Read-Only Schedule Link:</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="form-control" value="${shareUrl}" id="modal-share-input" readonly>
            <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}'); API.showToast('Share link copied!', 'success');">Copy Link</button>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  sharePlan() {
    if (!this.selectedPackage || !this.currentSchedule) {
      API.showToast('Please select a package first.', 'error');
      return;
    }

    const shareToken = `PREVIEW-${this.selectedPackage.id}-${Date.now().toString(36)}`;
    const shareUrl = `${window.location.origin}/#share-${shareToken}`;

    App.showModal(`
      <div class="modal-header">
        <h3>🔗 Share Schedule Plan</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="font-size: 14px; margin-bottom: 20px;">
        <p style="color: var(--text-muted); margin-bottom: 14px;">
          Share this read-only schedule preview with clients or colleagues. They can inspect the complete randomized organic batch timeline without logging in:
        </p>

        <div class="form-group">
          <label class="form-label">Shareable Schedule Link</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" class="form-control" value="${shareUrl}" id="share-link-input-val" readonly>
            <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${shareUrl}'); API.showToast('Share link copied to clipboard!', 'success');">Copy Link</button>
          </div>
        </div>

        <div style="padding: 12px 14px; background: #f8f8f8; border: 1px solid #e8e8e8; border-radius: 8px; font-size: 12px; color: var(--text-dim);">
          🔒 This link is read-only. Viewers cannot modify your settings or access your account.
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Done</button>
      </div>
    `);
  },

  copySchedule() {
    if (!this.currentSchedule || !this.selectedPackage) {
      API.showToast('No schedule calculated yet to copy.', 'error');
      return;
    }

    const s = this.currentSchedule;
    const targetUrl = (document.getElementById('sched-target-url') && document.getElementById('sched-target-url').value.trim()) || 'Not specified';
    const likesCount = s.totalLikes !== undefined ? s.totalLikes : this.totalLikes;
    const wavesCount = s.likesWaves !== undefined ? s.likesWaves : this.likesWaves;

    let text = `====================================================\n`;
    text += `SCHEDULE & DELIVERY BREAKDOWN — ${this.selectedPackage.name}\n`;
    text += `====================================================\n`;
    text += `Target URL: ${targetUrl}\n`;
    text += `Total Quantity: ${s.totalQuantity.toLocaleString()} (${s.totalBatches} batches)\n`;
    text += `Likes: ${likesCount > 0 ? `${likesCount} (${wavesCount} waves)` : 'Turned Off'}\n`;
    text += `Saves: ${(s.totalSaves || 0) > 0 ? `${s.totalSaves} (${s.savesWaves} waves)` : 'Turned Off'}\n`;
    text += `Shares: ${(s.totalShares || 0) > 0 ? `${s.totalShares} (${s.sharesWaves} waves)` : 'Turned Off'}\n`;
    text += `Reposts: ${(s.totalReposts || 0) > 0 ? `${s.totalReposts} (${s.repostsWaves} waves)` : 'Turned Off'}\n`;
    text += `Batch Interval: ${s.intervalMinutes} minutes\n`;
    text += `Campaign Window: ${s.campaignWindowHours} hours\n`;
    text += `Start Time: Immediate upon order (${new Date(s.startTime).toLocaleString()})\n`;
    text += `Remaining Window Buffer: ${s.bufferText}\n`;
    text += `Pacing: Organic Randomized Pacing (Minimum 100 views/batch)\n`;
    text += `----------------------------------------------------\n`;
    text += `BATCH # | VIEWS | LIKES | SAVES | SHARES | REPOSTS | RELATIVE TIME | CLOCK TIME\n`;
    text += `----------------------------------------------------\n`;

    s.batches.forEach(b => {
      const dt = new Date(b.scheduledAt).toLocaleString();
      const likesStr = b.likesQuantity > 0 ? `+${b.likesQuantity} likes` : '-';
      const savesStr = b.savesQuantity > 0 ? `+${b.savesQuantity} saves` : '-';
      const sharesStr = b.sharesQuantity > 0 ? `+${b.sharesQuantity} shares` : '-';
      const repostsStr = b.repostsQuantity > 0 ? `+${b.repostsQuantity} reposts` : '-';
      text += `#${String(b.batchNumber).padEnd(3, ' ')} | ${String(b.plannedQuantity + ' views').padEnd(11, ' ')} | ${likesStr.padEnd(12, ' ')} | ${savesStr.padEnd(12, ' ')} | ${sharesStr.padEnd(12, ' ')} | ${repostsStr.padEnd(12, ' ')} | ${b.relativeTimeText.padEnd(8, ' ')} | ${dt}\n`;
    });

    text += `====================================================\n`;

    navigator.clipboard.writeText(text);
    API.showToast('Complete schedule copied to clipboard in clean text format!', 'success');
  },

  viewScheduleDetails() {
    if (!this.currentSchedule || !this.selectedPackage) {
      API.showToast('Please select a package first.', 'error');
      return;
    }

    const s = this.currentSchedule;
    const targetUrl = (document.getElementById('sched-target-url') && document.getElementById('sched-target-url').value.trim()) || 'None provided';
    const finalBatch = s.batches[s.batches.length - 1];
    const estimatedCompletion = new Date(finalBatch.scheduledAt).toLocaleString();
    const likesCount = s.totalLikes !== undefined ? s.totalLikes : this.totalLikes;
    const wavesCount = s.likesWaves !== undefined ? s.likesWaves : this.likesWaves;

    App.showModal(`
      <div class="modal-header">
        <h3>🔍 Complete Schedule Details</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="font-size: 13px; margin-bottom: 20px;">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; padding: 16px; background: rgba(255, 255, 255, 0.02); border-radius: 10px; border: 1px solid var(--border-glass);">
          <div>Package: <strong style="color: #000000;">${this.selectedPackage.name}</strong></div>
          <div>Total Views: <strong style="color: var(--accent-primary); font-size: 14px;">${s.totalQuantity.toLocaleString()}</strong></div>
          <div>Total Likes: <strong style="color: #e11d48; font-size: 14px;">${likesCount > 0 ? `${likesCount} (${wavesCount} waves)` : 'Turned Off'}</strong></div>
          <div>Total Saves: <strong style="color: #d97706; font-size: 14px;">${(s.totalSaves || 0) > 0 ? `${s.totalSaves} (${s.savesWaves} waves)` : 'Turned Off'}</strong></div>
          <div>Total Shares: <strong style="color: #0891b2; font-size: 14px;">${(s.totalShares || 0) > 0 ? `${s.totalShares} (${s.sharesWaves} waves)` : 'Turned Off'}</strong></div>
          <div>Total Reposts: <strong style="color: #7c3aed; font-size: 14px;">${(s.totalReposts || 0) > 0 ? `${s.totalReposts} (${s.repostsWaves} waves)` : 'Turned Off'}</strong></div>
          <div>Total Batches: <strong>${s.totalBatches} batches</strong></div>
          <div>Batch Interval: <strong>${s.intervalMinutes} minutes</strong></div>
          <div>Campaign Window: <strong>${s.campaignWindowHours} hours</strong> (${s.campaignWindowMinutes} mins)</div>
          <div>Start Time: <strong style="color: var(--color-success);">⚡ Immediate (Upon Order)</strong></div>
          <div>Estimated Completion: <strong>${estimatedCompletion}</strong></div>
          <div>Remaining Buffer: <strong style="color: var(--color-success);">${s.bufferText}</strong></div>
          <div style="grid-column: span 2; word-break: break-all;">
            Target URL: <a href="${targetUrl}" target="_blank" style="color: var(--accent-primary);">${targetUrl}</a>
          </div>
        </div>

        <h4 style="font-size: 14px; margin-bottom: 10px;">Individual Batch Plan (${s.batches.length} Batches)</h4>
        <div class="table-container" style="max-height: 260px; overflow-y: auto;">
          <table class="data-table" style="font-size: 12px;">
            <thead>
              <tr>
                <th>Batch #</th>
                <th>Quantity</th>
                <th>Likes</th>
                <th>Saves</th>
                <th>Shares</th>
                <th>Reposts</th>
                <th>Relative Time</th>
                <th>Scheduled Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${s.batches.map(b => `
                <tr>
                  <td style="font-weight: 700;">#${b.batchNumber}</td>
                  <td style="font-weight: 700; color: #38bdf8;">${b.plannedQuantity.toLocaleString()} views</td>
                  <td>${b.likesQuantity > 0 ? `<span style="color: #e11d48; font-weight: 700;">❤️ +${b.likesQuantity}</span>` : '-'}</td>
                  <td>${b.savesQuantity > 0 ? `<span style="color: #d97706; font-weight: 700;">💾 +${b.savesQuantity}</span>` : '-'}</td>
                  <td>${b.sharesQuantity > 0 ? `<span style="color: #0891b2; font-weight: 700;">↗️ +${b.sharesQuantity}</span>` : '-'}</td>
                  <td>${b.repostsQuantity > 0 ? `<span style="color: #7c3aed; font-weight: 700;">🔁 +${b.repostsQuantity}</span>` : '-'}</td>
                  <td><code>${b.relativeTimeText}</code></td>
                  <td>${new Date(b.scheduledAt).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 10px;">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  async loadUserCampaigns() {
    const listContainer = document.getElementById('sched-campaigns-list');
    if (!listContainer) return;

    const res = await API.get('/api/scheduler/campaigns');
    if (!res.success) {
      listContainer.innerHTML = `<div style="color: var(--color-danger); padding: 16px;">Failed to load campaigns: ${res.error}</div>`;
      return;
    }

    const campaigns = res.campaigns || [];
    if (campaigns.length === 0) {
      listContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 24px;">No registered campaigns yet. Enter a TikTok link and click "Launch Campaign Now" above.</div>';
      return;
    }

    listContainer.innerHTML = `
      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Campaign Name</th>
              <th>Package</th>
              <th>Target URL</th>
              <th>Progress</th>
              <th>Start Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${campaigns.map(c => `
              <tr>
                <td style="font-weight: 600; font-family: monospace;">${c.id}</td>
                <td style="font-weight: 600;">${c.name}</td>
                <td><span class="status-pill info">${c.package_name || 'Views'}</span></td>
                <td style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                  <a href="${c.target_url}" target="_blank" style="color: var(--accent-primary); text-decoration: none;">${c.target_url}</a>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="flex: 1; height: 6px; background: #e2e8f0; border-radius: 9999px; overflow: hidden; width: 60px;">
                      <div style="width: ${c.total_batches > 0 ? Math.round(((c.delivered_batches || 0) / c.total_batches) * 100) : 0}%; height: 100%; background: var(--color-success);"></div>
                    </div>
                    <span style="font-size: 11px; color: var(--text-muted);">${c.delivered_batches || 0}/${c.total_batches}</span>
                  </div>
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">${new Date(c.start_time).toLocaleString()}</td>
                <td><span class="status-pill ${c.status.toLowerCase()}">${c.status}</span></td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    ${c.status === 'Running' ? `
                      <button class="btn btn-secondary btn-sm" onclick="EngagementComponent.updateCampaignStatus('${c.id}', 'Paused')">Pause</button>
                    ` : c.status === 'Paused' ? `
                      <button class="btn btn-secondary btn-sm" onclick="EngagementComponent.updateCampaignStatus('${c.id}', 'Running')">Resume</button>
                    ` : ''}
                    ${['Scheduled', 'Running', 'Paused'].includes(c.status) ? `
                      <button class="btn btn-danger btn-sm" onclick="EngagementComponent.updateCampaignStatus('${c.id}', 'Cancelled')">Cancel</button>
                    ` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="EngagementComponent.viewCampaignDetails('${c.id}')">Details</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  },

  async updateCampaignStatus(campaignId, newStatus) {
    if (!confirm(`Are you sure you want to change campaign status to ${newStatus}?`)) return;
    const res = await API.post(`/api/scheduler/campaigns/${campaignId}/status`, { status: newStatus });
    if (res.success) {
      API.showToast(res.message, 'success');
      this.loadUserCampaigns();
    } else {
      API.showToast(res.error || 'Failed to update campaign', 'error');
    }
  },

  async viewCampaignDetails(campaignId) {
    const res = await API.get(`/api/scheduler/campaigns/${campaignId}`);
    if (!res.success) {
      API.showToast(res.error || 'Failed to load details', 'error');
      return;
    }

    const { campaign, batches, nextBatch } = res;
    App.showModal(`
      <div class="modal-header">
        <h3>Campaign Details: ${campaign.name}</h3>
        <button class="modal-close" onclick="App.closeModal()">✕</button>
      </div>

      <div style="margin-bottom: 16px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: rgba(0,0,0,0.02); padding: 14px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
        <div>Status: <span class="status-pill ${campaign.status.toLowerCase()}">${campaign.status}</span></div>
        <div>Interval: <strong>${campaign.interval_minutes} mins</strong> (${campaign.total_batches} Batches)</div>
        <div>Target URL: <a href="${campaign.target_url}" target="_blank" style="color: var(--accent-primary); word-break: break-all;">${campaign.target_url}</a></div>
        <div>Next Batch: <strong>${nextBatch ? `Batch ${nextBatch.batch_number} at ${new Date(nextBatch.scheduled_at).toLocaleTimeString()}` : 'Completed / None'}</strong></div>
      </div>

      <!-- Package Metric Breakdown Summary -->
      <div style="margin-bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
        <span style="background: rgba(59, 130, 246, 0.1); color: #2563eb; border: 1px solid rgba(59, 130, 246, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">👁️ Views: ${campaign.total_quantity.toLocaleString()}</span>
        ${campaign.total_likes ? `<span style="background: rgba(239, 68, 68, 0.1); color: #dc2626; border: 1px solid rgba(239, 68, 68, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">❤️ Likes: ${campaign.total_likes.toLocaleString()} (${campaign.likes_waves || 3} waves)</span>` : ''}
        ${campaign.total_saves ? `<span style="background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔖 Saves: ${campaign.total_saves.toLocaleString()} (${campaign.saves_waves || 2} waves)</span>` : ''}
        ${campaign.total_shares ? `<span style="background: rgba(16, 185, 129, 0.1); color: #059669; border: 1px solid rgba(16, 185, 129, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">↗️ Shares: ${campaign.total_shares.toLocaleString()} (${campaign.shares_waves || 2} waves)</span>` : ''}
        ${campaign.total_reposts ? `<span style="background: rgba(99, 102, 241, 0.1); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.25); padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">🔁 Reposts: ${campaign.total_reposts.toLocaleString()} (${campaign.reposts_waves || 2} waves)</span>` : ''}
      </div>

      <h4 style="font-size: 14px; margin-bottom: 10px;">Batch Execution List (${batches.length} Batches)</h4>
      <div class="table-container" style="max-height: 320px; overflow-y: auto;">
        <table class="data-table" style="font-size: 12px;">
          <thead>
            <tr>
              <th>#</th>
              <th>Views</th>
              <th>Engagement Added</th>
              <th>Schedule & Dispatched</th>
              <th>Status</th>
              <th>Provider Orders</th>
            </tr>
          </thead>
          <tbody>
            ${batches.map(b => `
              <tr>
                <td><strong>Batch ${b.batch_number}</strong></td>
                <td><strong>${b.planned_quantity.toLocaleString()}</strong></td>
                <td>
                  <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    ${b.likes_quantity > 0 ? `<span style="background: rgba(239, 68, 68, 0.12); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">❤️ +${b.likes_quantity} Likes</span>` : ''}
                    ${b.saves_quantity > 0 ? `<span style="background: rgba(245, 158, 11, 0.12); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">🔖 +${b.saves_quantity} Saves</span>` : ''}
                    ${b.shares_quantity > 0 ? `<span style="background: rgba(16, 185, 129, 0.12); color: #059669; border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">↗️ +${b.shares_quantity} Shares</span>` : ''}
                    ${b.reposts_quantity > 0 ? `<span style="background: rgba(99, 102, 241, 0.12); color: #4f46e5; border: 1px solid rgba(99, 102, 241, 0.3); padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 11px;">🔁 +${b.reposts_quantity} Reposts</span>` : ''}
                    ${(!b.likes_quantity && !b.saves_quantity && !b.shares_quantity && !b.reposts_quantity) ? `<span style="color: var(--text-muted); font-size: 11px;">Views Only</span>` : ''}
                  </div>
                </td>
                <td>
                  <div><span style="color: var(--text-muted); font-size: 11px;">Sched:</span> <strong>${new Date(b.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong></div>
                  ${b.executed_at ? `<div style="font-size: 11px; color: #10b981; margin-top: 3px; font-weight: 600;">⚡ Sent: ${new Date(b.executed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>` : ''}
                </td>
                <td>
                  ${b.status === 'Delivered' ? `<span class="status-pill delivered">Delivered</span>` : ''}
                  ${b.status === 'Processing' ? `<span class="status-pill processing">Processing</span>` : ''}
                  ${b.status === 'Scheduled' && b.last_error && b.last_error.toLowerCase().includes('active order') ? `<span class="status-pill" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.3); font-weight: 600;" title="${b.last_error}">⏳ Active Order (Retrying)</span>` : ''}
                  ${b.status === 'Scheduled' && (!b.last_error || !b.last_error.toLowerCase().includes('active order')) ? `<span class="status-pill scheduled">${b.status}</span>` : ''}
                  ${b.status === 'Failed' ? `<span class="status-pill failed" title="${b.last_error || 'Error'}">Failed</span>` : ''}
                  ${b.status === 'Cancelled' ? `<span class="status-pill canceled">Cancelled</span>` : ''}
                  ${b.last_error && !b.last_error.toLowerCase().includes('active order') ? `<span title="${b.last_error}" style="color: #ef4444; font-size: 11px; margin-left: 4px; cursor: help;">⚠️ Details</span>` : ''}
                </td>
                <td>
                  <div style="display: flex; flex-direction: column; gap: 3px;">
                    <div>
                      <span style="font-size: 11px; color: var(--accent-primary); font-weight: 700;">👁️ Views:</span>
                      <code style="font-size: 11px;">${b.provider_order_id ? `#${b.provider_order_id}` : (b.last_error && b.last_error.toLowerCase().includes('active order') ? 'Waiting release' : (b.status === 'Failed' ? 'Failed' : 'Queued'))}</code>
                    </div>
                    ${(b.likes_quantity > 0 || b.likes_provider_order_id) ? `
                      <div>
                        <span style="font-size: 11px; color: #ef4444; font-weight: 700;">❤️ Likes:</span>
                        <code style="font-size: 11px; color: #ef4444;">${b.likes_provider_order_id ? `#${b.likes_provider_order_id}` : (b.status === 'Delivered' ? 'Delivering...' : 'Queued')}</code>
                      </div>
                    ` : ''}
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 18px; flex-wrap: wrap; gap: 10px;">
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-primary btn-sm" onclick="EngagementComponent.dispatchCampaignNow('${campaign.id}')">⚡ Dispatch Due Batches Now</button>
          ${['Scheduled', 'Running', 'Paused'].includes(campaign.status) ? `<button class="btn btn-danger btn-sm" onclick="EngagementComponent.updateCampaignStatus('${campaign.id}', 'Cancelled')" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);">Cancel Campaign</button>` : ''}
        </div>
        <button class="btn btn-secondary btn-sm" onclick="App.closeModal()">Close</button>
      </div>
    `);
  },

  async dispatchCampaignNow(campaignId) {
    API.showToast('Executing due campaign batches...', 'info');
    const res = await API.post(`/api/scheduler/campaigns/${campaignId}/dispatch`);
    if (res.success) {
      API.showToast(res.message || 'Dispatch completed.', 'success');
      this.viewCampaignDetails(campaignId);
      this.loadUserCampaigns();
    } else {
      API.showToast(res.error || 'Failed to dispatch: ' + res.error, 'error');
    }
  }
};

// Backwards compatibility alias
window.CampaignSchedulerComponent = window.EngagementComponent;
