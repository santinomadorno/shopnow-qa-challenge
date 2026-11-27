# API evidence

Captured with Node `fetch` against the local app (`npm run dev`). Data reset before each block. Logged in as Ana (`ana@shopnow.test`).

## BUG-01 Order over $100: server answers after ~4 s (UI aborts at 3 s) and the payment is created anyway

```
GET /api/payments
-> HTTP 200 (1 ms) [{"id":2,"userId":1,"orderId":2,"amount":24.55,"cardLast4":"4242","status":"approved","createdAt":"2026-10-15T02:30:00.000Z"},{"id":1,"userId":1,"orderId":1,"amount":28.7,"cardLast4":"4242","status":"approved","createdAt":"2026-10-02T15:10:00.000Z"}]

POST /api/checkout {"items":[{"productId":8,"quantity":1}],"coupons":[],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (4012 ms) {"id":4,"userId":1,"createdAt":"2026-11-27T02:47:48.767Z","items":[{"productId":8,"name":"Ergonomic chair","price":129,"quantity":1}],"coupons":[],"subtotal":129,"discount":0,"total":129,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":4,"displayDate":"11/27/2026","displayTime":"23:47"}

GET /api/payments
-> HTTP 200 (6 ms) [{"id":4,"userId":1,"orderId":4,"amount":129,"cardLast4":"4242","status":"approved","createdAt":"2026-11-27T02:47:48.767Z"},{"id":2,"userId":1,"orderId":2,"amount":24.55,"cardLast4":"4242","status":"approved","createdAt":"2026-10-15T02:30:00.000Z"},{"id":1,"userId":1,"orderId":1,"amount":28.7,"cardLast4":"4242","status":"approved","createdAt":"2026-10-02T15:10:00.000Z"}]

```

## BUG-02 Ana reads Bruno's order #3 (name + address exposed)

```
GET /api/orders/3
-> HTTP 200 (2 ms) {"id":3,"userId":2,"createdAt":"2026-10-20T13:45:00.000Z","items":[{"productId":6,"name":"Mechanical keyboard","price":89.9,"quantity":1}],"coupons":[{"code":"FLOCK10","percent":10}],"subtotal":89.9,"discount":8.99,"total":80.91,"shipping":{"name":"Bruno Diaz","address":"742 Evergreen St, Rosario"},"paymentId":3,"displayDate":"10/20/2026","displayTime":"10:45"}

```

## BUG-03 Negative quantity accepted: total goes down, stock goes up

```
POST /api/checkout {"items":[{"productId":1,"quantity":1},{"productId":3,"quantity":-1}],"coupons":[],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (704 ms) {"id":4,"userId":1,"createdAt":"2026-11-27T02:47:49.491Z","items":[{"productId":1,"name":"Ceramic mug","price":8.35,"quantity":1},{"productId":3,"name":"Basic T-shirt","price":14.35,"quantity":-1}],"coupons":[],"subtotal":-6,"discount":0,"total":-6,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":4,"displayDate":"11/27/2026","displayTime":"23:47"}

GET /api/products/3
-> HTTP 200 (1 ms) {"id":3,"name":"Basic T-shirt","category":"Clothing","price":14.35,"stock":41,"description":"Combed cotton T-shirt, regular fit."}

```

## BUG-04 Buying 3 chairs with stock 2: accepted, stock goes negative

```
POST /api/checkout {"items":[{"productId":8,"quantity":3}],"coupons":[],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (4008 ms) {"id":4,"userId":1,"createdAt":"2026-11-27T02:47:53.498Z","items":[{"productId":8,"name":"Ergonomic chair","price":129,"quantity":3}],"coupons":[],"subtotal":387,"discount":0,"total":387,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":4,"displayDate":"11/27/2026","displayTime":"23:47"}

GET /api/products/8
-> HTTP 200 (3 ms) {"id":8,"name":"Ergonomic chair","category":"Home","price":129,"stock":-1,"description":"Office chair with adjustable lumbar support and 3D armrests."}

```

## BUG-05 Lowercase coupon validates but with 0%

```
POST /api/coupons/validate {"code":"flock10"}
-> HTTP 200 (1 ms) {"code":"flock10","percent":0}

POST /api/coupons/validate {"code":"FLOCK10"}
-> HTTP 200 (1 ms) {"code":"FLOCK10","percent":10}

```

## BUG-07 Two coupons stacked / same coupon twice in one checkout

```
POST /api/checkout {"items":[{"productId":4,"quantity":1}],"coupons":["FLOCK10","BIENVENIDA15"],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (706 ms) {"id":4,"userId":1,"createdAt":"2026-11-27T02:47:54.213Z","items":[{"productId":4,"name":"Urban backpack","price":39.9,"quantity":1}],"coupons":[{"code":"FLOCK10","percent":10},{"code":"BIENVENIDA15","percent":15}],"subtotal":39.9,"discount":9.98,"total":29.92,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":4,"displayDate":"11/27/2026","displayTime":"23:47"}

POST /api/checkout {"items":[{"productId":4,"quantity":1}],"coupons":["FLOCK10","FLOCK10"],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (708 ms) {"id":5,"userId":1,"createdAt":"2026-11-27T02:47:54.920Z","items":[{"productId":4,"name":"Urban backpack","price":39.9,"quantity":1}],"coupons":[{"code":"FLOCK10","percent":10},{"code":"FLOCK10","percent":10}],"subtotal":39.9,"discount":7.98,"total":31.92,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":5,"displayDate":"11/27/2026","displayTime":"23:47"}

```

## BUG-09 3 x $8.35 charged as $25.04 instead of $25.05

```
POST /api/checkout {"items":[{"productId":1,"quantity":3}],"coupons":[],"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}}
-> HTTP 201 (706 ms) {"id":4,"userId":1,"createdAt":"2026-11-27T02:47:55.628Z","items":[{"productId":1,"name":"Ceramic mug","price":8.35,"quantity":3}],"coupons":[],"subtotal":25.04,"discount":0,"total":25.04,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"paymentId":4,"displayDate":"11/27/2026","displayTime":"23:47"}

```

## BUG-10 Seed order #2 created 2026-10-15T02:30Z (= Oct 14, 23:30 in Buenos Aires)

```
GET /api/orders/2
-> HTTP 200 (2 ms) {"id":2,"userId":1,"createdAt":"2026-10-15T02:30:00.000Z","items":[{"productId":5,"name":"Desk lamp","price":24.55,"quantity":1}],"coupons":[],"subtotal":24.55,"discount":0,"total":24.55,"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave, Buenos Aires"},"paymentId":2,"displayDate":"10/15/2026","displayTime":"23:30"}

```

## BUG-11 Shipping details with accents, ñ and º rejected

```
POST /api/checkout {"items":[{"productId":1,"quantity":1}],"coupons":[],"shipping":{"name":"José Peña","address":"Av. Córdoba 1234 5º B"},"card":{"number":"4242424242424242"}}
-> HTTP 400 (3 ms) {"error":"Please fill in the shipping details."}

```
