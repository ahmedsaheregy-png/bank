import os
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 1400, 'height': 950})
        
        file_path = os.path.abspath('tools/content-vault/index.html').replace('\\', '/')
        await page.goto(f'file:///{file_path}')
        await page.wait_for_timeout(1000)
        
        out_dir = 'C:/Users/hp/.gemini/antigravity/brain/6bd22884-e1de-44d0-b133-9ca578f882d6'
        
        # 1. Top view: White background + Live Edit Toolbar + Script 1 with its Storyboard Table
        await page.screenshot(path=os.path.join(out_dir, 'white_vault_1_scripts_and_tables.png'))
        print('Captured white_vault_1_scripts_and_tables.png')
        
        # 2. Scroll to Script 2 & Script 3 with their Storyboard Tables
        await page.evaluate("document.getElementById('table-SCRIPT-OPT-2').scrollIntoView({block: 'center'})")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(out_dir, 'white_vault_2_script2_table.png'))
        print('Captured white_vault_2_script2_table.png')
        
        # 3. Scroll to Official Approved Phrases
        await page.evaluate("document.getElementById('sec-official').scrollIntoView({block: 'start'})")
        await page.wait_for_timeout(400)
        await page.screenshot(path=os.path.join(out_dir, 'white_vault_3_official_phrases.png'))
        print('Captured white_vault_3_official_phrases.png')
        
        await browser.close()

if __name__ == '__main__':
    asyncio.run(main())
