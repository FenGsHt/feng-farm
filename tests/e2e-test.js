const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // 1. 打开游戏
  await page.goto('http://150.158.110.168:3007/');
  await page.waitForLoadState('networkidle');
  
  // 2. 输入名字并进入
  await page.fill('#player-name-input', '测试员');
  await page.click('#start-btn');
  await page.waitForTimeout(2000);
  
  // 3. 移动测试 - 点击不同位置
  await page.click('.plot-cell:nth-child(5)');
  await page.waitForTimeout(500);
  
  // 4. 种植测试
  await page.click('#plant-wheat');
  await page.waitForTimeout(500);
  
  // 5. 浇水测试
  await page.click('#water-btn');
  await page.waitForTimeout(500);
  
  // 6. 收获测试 - 等待成熟
  console.log('等待作物成熟...');
  await page.waitForTimeout(35000);
  await page.click('#harvest-btn');
  
  // 7. 验证结果
  const moneyText = await page.textContent('#money-display');
  console.log('最终金币:', moneyText);
  
  await browser.close();
  console.log('测试完成');
})();