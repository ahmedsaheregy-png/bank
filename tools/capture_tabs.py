import os
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1400, 'height': 900})
        
        file_path = os.path.abspath('tools/content-vault/index.html').replace('\\', '/')
        await page.goto(f'file:///{file_path}')
        await page.wait_for_timeout(1000)
        
        out_dir = 'C:/Users/hp/.gemini/antigravity/brain/6bd22884-e1de-44d0-b133-9ca578f882d6'
        
        # Tab 1: Storyboard
        await page.screenshot(path=os.path.join(out_dir, 'content_vault_tab1_storyboard.png'))
        print('Captured Tab 1')
        
        # Tab 2: Official Approved
        await page.evaluate("switchTab('official')")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(out_dir, 'content_vault_tab2_official.png'))
        print('Captured Tab 2')
        
        # Tab 3: Candidate Marketing Phrases
        await page.evaluate("switchTab('candidate')")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(out_dir, 'content_vault_tab3_candidate.png'))
        print('Captured Tab 3')
        
        # Tab 4: Scripts
        await page.evaluate("switchTab('scripts')")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(out_dir, 'content_vault_tab4_scripts.png'))
        print('Captured Tab 4')
        
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
