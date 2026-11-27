B=http://localhost:4321/api; J='-H Content-Type:application/json'
curl -s -XPOST $B/test/reset >/dev/null
curl -s -c /tmp/ana.txt $J -XPOST $B/login -d '{"email":"ana@shopnow.test","password":"Ana12345"}'; echo
echo "--coupon lower:"; curl -s $J -XPOST $B/coupons/validate -d '{"code":"flock10"}'; echo; curl -s $J -XPOST $B/coupons/validate -d '{"code":"FLOCK10"}'; echo
echo "--IDOR order 3 as Ana:"; curl -s -b /tmp/ana.txt $B/orders/3 | head -c 400; echo
echo "--date order 2:"; curl -s -b /tmp/ana.txt $B/orders/2 | grep -o '"createdAt[^,]*,\|"display[^,}]*'
SH='"shipping":{"name":"Ana Garcia","address":"1234 Corrientes Ave"},"card":{"number":"4242424242424242"}'
co(){ curl -s -w ' HTTP%{http_code}' -b /tmp/ana.txt $J -XPOST $B/checkout -d "$1" | grep -o '"subtotal[^}]*}\|HTTP.*\|"error[^}]*'; }
echo "--two coupons:"; co "{\"items\":[{\"productId\":1,\"quantity\":1}],\"coupons\":[\"FLOCK10\",\"BIENVENIDA15\"],$SH}"
echo "--same coupon twice:"; co "{\"items\":[{\"productId\":1,\"quantity\":1}],\"coupons\":[\"FLOCK10\",\"FLOCK10\"],$SH}"
echo "--lowercase coupon checkout:"; co "{\"items\":[{\"productId\":1,\"quantity\":1}],\"coupons\":[\"flock10\"],$SH}"
echo "--over stock chair qty5:"; co "{\"items\":[{\"productId\":8,\"quantity\":5}],$SH}"; curl -s $B/products/8 | grep -o '"stock":[-0-9]*'
echo "--negative qty:"; co "{\"items\":[{\"productId\":1,\"quantity\":1},{\"productId\":3,\"quantity\":-1}],$SH}"
echo "--zero qty:"; co "{\"items\":[{\"productId\":1,\"quantity\":0}],$SH}"
echo "--mug x3:"; co "{\"items\":[{\"productId\":1,\"quantity\":3}],$SH}"
echo "--tshirt x3:"; co "{\"items\":[{\"productId\":3,\"quantity\":3}],$SH}"
echo "--accented:"; co '{"items":[{"productId":1,"quantity":1}],"shipping":{"name":"José Pérez","address":"Av. Córdoba 1234"},"card":{"number":"4242424242424242"}}'
echo "--declined:"; co "{\"items\":[{\"productId\":1,\"quantity\":1}],\"shipping\":{\"name\":\"A\",\"address\":\"B\"},\"card\":{\"number\":\"4242424242420000\"}}"
echo "--payments:"; curl -s -b /tmp/ana.txt $B/payments | head -c 600; echo
echo "--checkout >100 timing:"; time co "{\"items\":[{\"productId\":8,\"quantity\":1}],$SH}"
echo "--category lowercase:"; curl -s "$B/products?category=home" ; echo
