Binance P2P MMK Profit Calculator
=================================

Version 4.3.0

Pages
-----
  input.html     New Entry     - enter what you paid, see the profit, save the day
  index.html     Dashboard     - live rate, totals, profit graph, last saved day
  history.html   Daily History - full record with search, filters and export
  import.html    Import Data   - read Binance Excel / CSV / screenshot


Folder layout
-------------
  Binance_P2P_MMK_Website/
    index.html
    input.html
    history.html
    import.html
    style.css
    shared.js
    rate.js               <- header rate ticker (refreshes every minute)
    input.js
    dashboard.js
    history.js
    import.js
    data/                 <- written by the tools, or by hand
    tools/
      update_rate.py      <- fetch the USDT/MMK rate (no credentials)
      fetch_c2c_history.py<- pull your own C2C orders (read-only API key)

app.js from versions 2/3 is NOT included - it was split into input.js and
dashboard.js. Do not add it back.


GETTING THE RATE INTO THE HEADER
================================
Every page shows a USDT/MMK ticker in the top bar. It tries three sources
in order, and shows the first one that works:

  1. data/rates.json          needs the folder served over http://
  2. data/rates-data.js       works from file:// (a script tag can load
                              local files where fetch() is not allowed)
  3. a rate you type in       press the pencil (✎) button in the top bar

If none is present it says "no rate yet" and tells you what to run. It
never invents a number.


OPTION A - no server, works right now (file://)
-----------------------------------------------
1. Double-click index.html as usual.

2. Click the pencil button (✎) in the top bar.

3. Type your buy rate and sell rate in MMK, e.g. 4405 and 4392.
   Leave one blank if you only know one side.

The ticker shows them straight away, marked "manual", and remembers them
for next time. Click the pencil again to change them.


OPTION B - automatic, needs a local server
------------------------------------------
1. Run the tool once:

       cd tools
       python update_rate.py

   That writes data/rates.json.

2. Serve the folder so the page is allowed to read that file:

       cd /path/to/Binance_P2P_MMK_Website
       python3 -m http.server 8000

3. Open http://localhost:8000/index.html

The ticker now reads the file every minute and refreshes the moment you
return to the tab. To keep the file current, run the tool on a timer:

       * * * * * cd /path/to/Binance_P2P_MMK_Website/tools && python update_rate.py

   Minute-level polling works but is optional - Binance rate-limits heavy
   polling and its abuse filter can block you. Every 5-15 minutes is
   plenty for a daily-rate calculator.


OPTION C - no server, automatic (file://)
-----------------------------------------
Run the tool with the browser file as well:

       cd tools
       python update_rate.py --also-write-js

That writes data/rates-data.js, which the page loads with a script tag -
allowed on file:// where fetch() is not. Reload the page to pick it up.


WHY THE BROWSER CANNOT FETCH BINANCE ITSELF
-------------------------------------------
Binance's P2P endpoint sends no CORS headers, so a browser page is not
permitted to call it directly. Anything claiming to do that would be a
number invented in the browser. The file (or your typed value) is what
feeds the ticker - which is why the age stamp is always shown.


Calculation
-----------
Receive Quantity = Total Quantity - Fee
Spread           = Daily Rate - P2P Rate
Gross Profit     = Receive Quantity x Spread
Fee Loss         = Fee x Spread
Net Profit       = Gross Profit - Fee Loss

Buy input
---------
P2P Rate (derived) = Total MMK Paid / Total Quantity
Buying Rate        = Total MMK Paid / Receive Quantity

Worked example
--------------
Total MMK Paid 1,500,000 MMK
Total Quantity 340.90 USDT
Fee            0.34 USDT
P2P Rate       4400 MMK
Daily Rate     4420 MMK

Receive Quantity    340.560000 USDT
Spread              20.00 MMK
Gross Profit        6,811.20 MMK
Fee Loss            6.80 MMK
Net Profit          6,804.40 MMK


Tools
-----
tools/update_rate.py         USDT/MMK quotes -> data/rates.json
    python update_rate.py                  fetch both sides, save, report
    python update_rate.py --inspect        print the raw response, save nothing
    python update_rate.py --side BUY       store the ask as the daily rate
    python update_rate.py --side SELL      store the bid as the daily rate
    python update_rate.py --side MID       store the midpoint (default)
    python update_rate.py --also-write-js  also write data/rates-data.js

tools/fetch_c2c_history.py   your own orders -> data/c2c-orders.json
    pip install binance-sdk-c2c            Python 3.10 or later
    export BINANCE_API_KEY="..."
    export BINANCE_API_SECRET="..."
    python fetch_c2c_history.py --inspect
    python fetch_c2c_history.py --days 90

    Make the API key READ-ONLY. No trading, no withdrawals. This only
    returns orders you placed through Binance P2P.

STATUS: neither tool has been run against Binance. They were written on a
machine with no outbound network access, so the logic is sound but the
live response shapes are unverified. That is why both support --inspect.

NOT YET WIRED: the site reads data/rates.json and data/rates-data.js, but
does not yet read data/c2c-orders.json on the Import page.


Notes
-----
- Saved days, theme, chart range and the rate value use localStorage.
  Nothing is sent to a server and no database is required.
- The graph is drawn from SAVED days, not from the live form.
- Binance P2P prices are advertiser quotes, not an official exchange rate,
  and they move all day. Treat any rate here as a convenience, not a
  settlement rate.
