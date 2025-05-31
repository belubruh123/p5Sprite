/* Simple static file server on http://localhost:8080 */
const express = require('express');
const app = express();
app.use(express.static(process.cwd()));
const PORT = 8080;
app.listen(PORT, () =>
  console.log(`🐣  Dev server running → http://localhost:${PORT}`)
);
