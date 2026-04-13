import time
from scraper.driver import make_driver

driver = make_driver()
driver.get("https://www.diretta.it/calcio/brasile/serie-a-betano/risultati/")
time.sleep(5)
html = driver.page_source
with open("diretta_test.html", "w", encoding="utf-8") as f:
    f.write(html)
driver.quit()
print("Done. Wrote to diretta_test.html")
