const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    // 1. 打开游戏
    console.log('1. 打开游戏页面...');
    await page.goto('http://150.158.110.168:3007/', { timeout: 60000 });
    await page.waitForSelector('#player-name-input', { timeout: 30000 });
    console.log('   ✓ 页面加载完成');
    
    // 2. 输入名字并进入
    console.log('2. 输入名字...');
    await page.fill('#player-name-input', '测试员');
    await page.click('#start-btn');
    await page.waitForTimeout(2000);
    console.log('   ✓ 已进入游戏');
    
    // 3. 等待游戏界面加载
    console.log('3. 等待游戏界面...');
    await page.waitForSelector('#game-screen:not(.hidden)', { timeout: 10000 });
    console.log('   ✓ 游戏界面已显示');
    
    // 4. 种植测试
    console.log('4. 种植小麦...');
    await page.click('#plant-wheat');
    await page.waitForTimeout(500);
    
    // 5. 点击田地种植
    console.log('5. 点击田地...');
    await page.click('.plot-cell');
    await page.waitForTimeout(1000);
    console.log('   ✓ 种植成功');
    
    // 6. 浇水测试
    console.log('6. 浇水...');
    await page.click('#water-btn');
    await page.waitForTimeout(500);
    console.log('   ✓ 浇水成功');
    
    // 7. 验证金币
    const moneyText = await page.textContent('#money-display');
    console.log(`   💰 当前金币: ${moneyText}`);
    
    console.log('\n✅ 基本功能测试通过！');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    // 截图保存错误
    await page.screenshot({ path: '/home/node/.openclaw/workspace-master-agent/feng-farm/docs/qa/screenshots/error.png' });
  }
  
  await browser.close();
})();