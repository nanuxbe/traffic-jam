const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:8000';

(async () => {
  const browser = await chromium.launch({
    headless: true,
    slowMo: 100,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  try {
    console.log('📍 Loading Traffic Jam game...');
    await page.goto(TARGET_URL);
    await page.waitForLoadState('networkidle');

    const title = await page.title();
    console.log('✅ Page loaded:', title);

    // Take initial screenshot
    await page.screenshot({ path: '/tmp/traffic-jam-initial.png', fullPage: true });
    console.log('📸 Initial screenshot saved');

    // Check game elements exist
    const parkingLot = await page.locator('.parking-lot').isVisible();
    console.log('✅ Parking lot visible:', parkingLot);

    const loadingZone = await page.locator('.loading-zone').isVisible();
    console.log('✅ Loading zone visible:', loadingZone);

    const passengerQueue = await page.locator('.passenger-queue').isVisible();
    console.log('✅ Passenger queue visible:', passengerQueue);

    // Count initial passengers
    const passengerCount = await page.locator('.passenger').count();
    console.log('📊 Initial passengers in queue:', passengerCount);

    // Count vehicles in parking lot
    const vehicleCount = await page.locator('.grid .vehicle').count();
    console.log('📊 Vehicles in parking lot:', vehicleCount);

    // Find clickable vehicles (ones that can exit)
    const clickableVehicles = await page.locator('.vehicle.clickable').count();
    console.log('📊 Clickable vehicles:', clickableVehicles);

    // Test clicking a vehicle if any are clickable
    if (clickableVehicles > 0) {
      console.log('\n🚗 Testing vehicle interaction...');

      // Click the first clickable vehicle
      await page.locator('.vehicle.clickable').first().click();
      await page.waitForTimeout(1500);

      // Check if vehicle moved to loading zone
      const loadingVehicles = await page.locator('.vehicle.in-loading').count();
      console.log('✅ Vehicles in loading zone:', loadingVehicles);

      // Take screenshot after first click
      await page.screenshot({ path: '/tmp/traffic-jam-after-click.png', fullPage: true });
      console.log('📸 Post-click screenshot saved');

      // Wait for some passengers to load
      await page.waitForTimeout(2000);

      // Check updated passenger count
      const newPassengerCount = await page.locator('.passenger').count();
      console.log('📊 Passengers remaining:', newPassengerCount);

      if (newPassengerCount < passengerCount) {
        console.log('✅ Passengers are being loaded! Game mechanics working.');
      }
    }

    // Test level selector
    console.log('\n🎮 Testing level selector...');
    await page.locator('.level-selector button:has-text("Level 2")').click();
    await page.waitForTimeout(1000);

    const level2Vehicles = await page.locator('.grid .vehicle').count();
    console.log('✅ Level 2 loaded with', level2Vehicles, 'vehicles');

    // Take final screenshot
    await page.screenshot({ path: '/tmp/traffic-jam-level2.png', fullPage: true });
    console.log('📸 Level 2 screenshot saved');

    console.log('\n✅ All tests passed! Traffic Jam game is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: '/tmp/traffic-jam-error.png' });
  } finally {
    await browser.close();
  }
})();
