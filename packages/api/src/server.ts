import { app } from './app.js';
import { PORT } from './constants.js';

app.listen(PORT, () => {
  console.log(`Mundialito API running on http://localhost:${PORT}`);
});
