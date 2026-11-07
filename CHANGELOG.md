# Changelog

## [0.2.0](https://github.com/pimabill/billing/compare/v0.1.0...v0.2.0) (2026-11-07)


### ⚠ BREAKING CHANGES

* the SDKs' default production and sandbox URLs are now https://api.pimabill.com and https://sandbox.pimabill.com.

### Features

* **api:** look up customers by externalId and plans and add-ons by code, with a guide to building an integration ([#149](https://github.com/pimabill/billing/issues/149)) ([ca9839e](https://github.com/pimabill/billing/commit/ca9839ef11c4a9ba6e3492d5828d886e7e143f2f))
* **auth:** Cloudflare Turnstile on sign-in, sign-up and password reset ([#155](https://github.com/pimabill/billing/issues/155)) ([12b2bd8](https://github.com/pimabill/billing/commit/12b2bd80ab158e2c1d5d81a57a452db419c997f4))
* **checkout:** a hosted checkout where customers choose how to pay, and a cleaner customer portal ([#163](https://github.com/pimabill/billing/issues/163)) ([a134e97](https://github.com/pimabill/billing/commit/a134e97db34116c7e1d5d991e8e62d50cdf6dbf2))
* **checkout:** customers see MTN, Airtel, Visa and PayPal by name, and Free matches at 500 subscriptions ([#164](https://github.com/pimabill/billing/issues/164)) ([c505e7b](https://github.com/pimabill/billing/commit/c505e7beb2f43a6412c005323d574f0e888d15b1))
* **checkout:** each provider shows what it takes in the currency, and Growth pays on the hosted checkout ([#165](https://github.com/pimabill/billing/issues/165)) ([2960ed9](https://github.com/pimabill/billing/commit/2960ed9198aa36eb479e7312b65c818f8cbaaa29))
* **cloud:** Free is 500 customers, Growth is dollars only, and new sign-ups alert the operator ([#162](https://github.com/pimabill/billing/issues/162)) ([33cc198](https://github.com/pimabill/billing/commit/33cc1981a7b3b51e4a9e9b8ce269077d06cf4925))
* **dashboard:** a cleaner, modern look for the dashboard and landing page ([#160](https://github.com/pimabill/billing/issues/160)) ([13527c8](https://github.com/pimabill/billing/commit/13527c88205b263d45a17e29b42b9b73439a964b))
* **gateway:** a general external payment gateway connector ([#169](https://github.com/pimabill/billing/issues/169)) ([676a859](https://github.com/pimabill/billing/commit/676a859cca2dc267b993c20bc9870f4fb39b7f5d))
* **install:** one-command self-hosted install and upgrade ([#170](https://github.com/pimabill/billing/issues/170)) ([8e4d23f](https://github.com/pimabill/billing/commit/8e4d23f5dc51bd1d73f04dbe6ce93a9a5d196007))
* **invoices:** sell one-time products by add-on code, and let customers pay invoices in parts ([#148](https://github.com/pimabill/billing/issues/148)) ([52dde5f](https://github.com/pimabill/billing/commit/52dde5fbfc0018dc1717c340f62d4828c4ad9de2))
* **landing:** rebuild the homepage around product UI on a white canvas ([#161](https://github.com/pimabill/billing/issues/161)) ([3348dd7](https://github.com/pimabill/billing/commit/3348dd7b51a8b247a23733d4192e48f7e333af28))
* **landing:** topic pages for countries, use cases and alternatives, with structured data ([#156](https://github.com/pimabill/billing/issues/156)) ([c952f46](https://github.com/pimabill/billing/commit/c952f469fc06cb76212c9aed8ba0c1aaf504bb33))
* the hosted cloud moves to pimabill.com ([#153](https://github.com/pimabill/billing/issues/153)) ([3f79319](https://github.com/pimabill/billing/commit/3f793199221d762be9604d315e90f4dc8b96c453))


### Bug Fixes

* **api:** API keys can read and update organisation settings and payment methods ([#159](https://github.com/pimabill/billing/issues/159)) ([cec841e](https://github.com/pimabill/billing/commit/cec841e1198eecb17d2402720e984f71ada075b0))
* **dashboard:** signed-out pages reach the API for the bot check and password reset ([#157](https://github.com/pimabill/billing/issues/157)) ([2e69874](https://github.com/pimabill/billing/commit/2e69874e026c6034acaf6590f35a18ea93c00319))
* **deploy:** retry the image pull when the registry connection drops ([#168](https://github.com/pimabill/billing/issues/168)) ([29456f1](https://github.com/pimabill/billing/commit/29456f1ee505b4c1607dc899173f36dd72687d3f))
* **deploy:** wait six minutes for the API, which migrates every organisation first ([#167](https://github.com/pimabill/billing/issues/167)) ([6ce7791](https://github.com/pimabill/billing/commit/6ce7791d3d0bed28ed27bbb7e41657c73d32edee))
* **email:** the sandbox emails only team members, and no email goes to a domain that can't receive it ([#151](https://github.com/pimabill/billing/issues/151)) ([2c2563e](https://github.com/pimabill/billing/commit/2c2563eb5f124b7267d2445a119440a113d41f2f))
* **payments:** refunds come off what was paid on the invoice, and cloud plans are set up once at startup ([#152](https://github.com/pimabill/billing/issues/152)) ([1ce6233](https://github.com/pimabill/billing/commit/1ce6233673d33c5d3dd883c69ca98d2cbd3d1324))

## 0.1.0 (2026-10-26)


### ⚠ BREAKING CHANGES

* **providers:** the API lists every supported provider without credentials, and live and sandbox keep to their own keys ([#141](https://github.com/pimabill/billing/issues/141))
* **deploy:** the stack no longer starts without real secrets in .env.
* **payments:** Stripe needs webhookSecret and Flutterwave secretHash configured, or their payments are not confirmed.
* **auth:** portal links with ?key= stop working; keys with resource scopes are limited to those resources.

### Features

* add PayPal provider, fix multi-provider dashboard, regroup analytics KPIs ([f120fe8](https://github.com/pimabill/billing/commit/f120fe8b63da40b084548c9f44b1c99518c4a39e))
* apply PR review comments, analytics KPIs backend endpoint, ARR display, tooltips, provider ordering, multi-provider checkout ([2fcdff1](https://github.com/pimabill/billing/commit/2fcdff10ae4b618c92e889619789350e0d27464d))
* **auth:** two-step sign-in with an authenticator app, and organisations that require it ([#134](https://github.com/pimabill/billing/issues/134)) ([857bd87](https://github.com/pimabill/billing/commit/857bd871f6e3f2be49a36db2dc8859553c8c825b))
* **charges:** charge a customer once or on a plan, from the dashboard or in one API call ([#143](https://github.com/pimabill/billing/issues/143)) ([9234bba](https://github.com/pimabill/billing/commit/9234bba948bbfea84b78f736c845c06b77501756))
* **cloud-plans:** African pricing in every Flutterwave currency, a generous Free tier, unlimited Growth, and Partner ([#131](https://github.com/pimabill/billing/issues/131)) ([b007d89](https://github.com/pimabill/billing/commit/b007d89f15ea305e58586c5da520d07af312503e))
* **cloud-plans:** Growth at $15, and Enterprise with no public price ([#133](https://github.com/pimabill/billing/issues/133)) ([60ac503](https://github.com/pimabill/billing/commit/60ac50365a3d6d87dbd49c89b06b82e0c6124323))
* **currencies:** custom currencies, a reporting currency, and daily exchange rates kept by date ([#138](https://github.com/pimabill/billing/issues/138)) ([0e05894](https://github.com/pimabill/billing/commit/0e058946b49ebe7d0540c497f492642db7a050ab))
* **dashboard:** an Overview that shows setup, payments and your plan; Analytics in tabs ([#132](https://github.com/pimabill/billing/issues/132)) ([147bb02](https://github.com/pimabill/billing/commit/147bb0235a2e8e82862eaa07f1531cebf69c189a))
* **dashboard:** branded sign-in pages, brand fonts, kept out of search ([b2afe54](https://github.com/pimabill/billing/commit/b2afe54e9e9e846431634f7af32177ead1e68306))
* **dashboard:** Sandbox switch sits with Documentation in the sidebar ([#126](https://github.com/pimabill/billing/issues/126)) ([a666e84](https://github.com/pimabill/billing/commit/a666e849e24218f12d425d455faa2b775ee4cba1))
* **dashboard:** the animated mark is the loading indicator everywhere ([58ba521](https://github.com/pimabill/billing/commit/58ba521e90480a511b657b712e4ef39161029838))
* friendlier SDKs, kept in step with the API and docs ([46694f1](https://github.com/pimabill/billing/commit/46694f17643e84efe9a48cc54a5e5f29c43e9ef3))
* **landing:** a premium look: a deep hero with the product rising out of it, a facts strip, dark feature bands and a lit Growth plan ([#139](https://github.com/pimabill/billing/issues/139)) ([5bde19b](https://github.com/pimabill/billing/commit/5bde19b4464ebdeacdce98bc9d8f211a54b30efa))
* **landing:** rebuild the landing page on the PimaBill brand ([833b8eb](https://github.com/pimabill/billing/commit/833b8ebf09ff7f22ce42007c81017ef3e909eb24))
* **landing:** show the product, compare fairly with Stripe Billing, Lago and Chargebee, and logos on the payment rails ([#137](https://github.com/pimabill/billing/issues/137)) ([ccbac7b](https://github.com/pimabill/billing/commit/ccbac7b015f70d48683c81d68713a31a094a1ee8))
* money movement, ledger, crypto, team access and migrations ([425c284](https://github.com/pimabill/billing/commit/425c284c7e90827dac6de26839b2195c7e495017))
* organisation access controls, a platform service API and an operator command ([165eb23](https://github.com/pimabill/billing/commit/165eb23201ddd23ae30ae36906e94d02eaf4bf68))
* organisation access controls, a platform service API and an operator command ([d012579](https://github.com/pimabill/billing/commit/d012579c6bbafc626f78f1ac8c9875f8d7ec2d19))
* plan limits an operator can set per organisation ([73cc5c4](https://github.com/pimabill/billing/commit/73cc5c4d7cff1ce330e22c57dfe875f18dd72b19))
* plan limits an operator can set per organisation ([0a98d35](https://github.com/pimabill/billing/commit/0a98d35bfedfebd5d7f6f1cbbe25f10aa0a7eecc))
* **platform:** control-plane service API exposes the console's organisation data ([dcde48b](https://github.com/pimabill/billing/commit/dcde48b11bc4f07830847df50015c2c2f961b2c4))
* **platform:** control-plane service API exposes the console's organisation data ([e55475e](https://github.com/pimabill/billing/commit/e55475eff2aac31a0ee55d1e5ba105bc1321fac8))
* **platform:** the platform console moves to the private control panel ([e5ae4e9](https://github.com/pimabill/billing/commit/e5ae4e9f0e6e8d26a31545e0010df9cc9bb06652))
* **platform:** the platform console moves to the private control panel ([5b804fd](https://github.com/pimabill/billing/commit/5b804fda2b7e1da29ab12673b97101e0101b32f2))
* price PimaBill Cloud at $15/month ([656b836](https://github.com/pimabill/billing/commit/656b8367537b290786180950ed63b034b1194c98))
* price PimaBill Cloud at $15/month and capitalise the wordmark ([92106a1](https://github.com/pimabill/billing/commit/92106a11f6c0c9ddae5ca91b65ca642eae97a967))
* **providers:** the API lists every supported provider without credentials, and live and sandbox keep to their own keys ([#141](https://github.com/pimabill/billing/issues/141)) ([32456cf](https://github.com/pimabill/billing/commit/32456cfb079ccf889a0e55677b0a04be754156ee))
* rebuild the landing page, sign-in pages and docs on the PimaBill brand ([b80d758](https://github.com/pimabill/billing/commit/b80d7580111c8a9d1a5f27e97e1b2cbb349ccaff))
* sandbox mode, a Live/Sandbox dashboard switch, and SDK publishing ([#116](https://github.com/pimabill/billing/issues/116)) ([239a0d6](https://github.com/pimabill/billing/commit/239a0d6e67a67d5cd6229b60a72b90e5adb81107))
* **sdk:** PimaBillClient everywhere and the hosted API by default ([ebdbba8](https://github.com/pimabill/billing/commit/ebdbba8c1b1379d7317a2fc59e9d072a6523d82d))


### Bug Fixes

* add noopener,noreferrer to checkout window.open to prevent tabnabbing ([bea3798](https://github.com/pimabill/billing/commit/bea3798779b007bca3a9d7de8145ffeade166b80))
* add proper auth error handling in PesapalProvider.getAccessToken ([12d91c6](https://github.com/pimabill/billing/commit/12d91c6fc48da8a64b7b40bb28d08e87f3ac0f0a))
* address CI findings on the system review changes ([1c7f7d9](https://github.com/pimabill/billing/commit/1c7f7d90458fb00ac9c642f6c4c8f3698c7751b5))
* **api:** describe the responses of the money, ledger and team endpoints ([132382e](https://github.com/pimabill/billing/commit/132382e4f60aa3f80b454d24e607897f4832ca3e))
* **api:** optional, typed query parameters and a real amount type ([77cc2ec](https://github.com/pimabill/billing/commit/77cc2ec275e1d797cbdddc3a8fac6bf83f26e350))
* **api:** typed parties, whole-number counts and one request type per endpoint ([28e08df](https://github.com/pimabill/billing/commit/28e08df0f01ba88848591fcde988dc2df7bdaedf))
* **auth:** enforce API key scopes, hash keys, scope portal links ([f55aad9](https://github.com/pimabill/billing/commit/f55aad942fdd9b2f5005011b4c7cd7ad7e25259b))
* Auto-register Pesapal IPN URL on provider creation (Option A) ([c2c2134](https://github.com/pimabill/billing/commit/c2c213467a09819347ee2f953aba3c976847e488))
* **billing:** bill each period exactly once, and fix dunning ([55a7287](https://github.com/pimabill/billing/commit/55a7287d8c9f4121aa2669195a51c2b0f5e07440))
* currency-aware amount formatting and environment label in Pesapal charge errors ([010acbc](https://github.com/pimabill/billing/commit/010acbc40437498d5ba1b890f6c3474ab2b76282))
* **dashboard:** hydration on every page, revenue months, honest charts, brand colours and provider logos ([#136](https://github.com/pimabill/billing/issues/136)) ([159e78e](https://github.com/pimabill/billing/commit/159e78ec7c18de46b67508a68dc352468f1dbd0e))
* **database:** stop tenant pools exhausting Postgres connections ([85197e9](https://github.com/pimabill/billing/commit/85197e9acf9abae0b7b2a57bc87fed046efa1773))
* **database:** stop tenant pools exhausting Postgres connections ([7e75ac6](https://github.com/pimabill/billing/commit/7e75ac676a696e7f83b4b9211be9991e93841668))
* **deploy:** refuse placeholder secrets; document the security changes ([762cfac](https://github.com/pimabill/billing/commit/762cfacb3d904647068ca6d94d0bbee52c446247))
* **deploy:** ship the compose file and pull images from this repo's owner ([c743e03](https://github.com/pimabill/billing/commit/c743e03f0c85b12cdfb5dd307c674e58c6eb3865))
* **deploy:** ship the compose file and pull images from this repo's owner ([b2cb7b4](https://github.com/pimabill/billing/commit/b2cb7b4acd18da650dc09595aa22c205fd29ca8e))
* Docker compose on server ([e6525cc](https://github.com/pimabill/billing/commit/e6525cc3f604f4ba0ef0b1466804c4d4bab46f7a))
* Docker compose on server ([c7017ef](https://github.com/pimabill/billing/commit/c7017effb737795c2796235de1017a6a62245ea6))
* handle webhook pending status, fix priority nullish coalescing, tabnabbing security ([ab02851](https://github.com/pimabill/billing/commit/ab02851b00b008024276c52283613be34e76065d))
* keep platform access fields out of the sign-in response ([b53dd96](https://github.com/pimabill/billing/commit/b53dd96c01700940e9a2d276931f3037680a9d9b))
* migrate tenant databases as the database admin ([7083383](https://github.com/pimabill/billing/commit/7083383289af28497694e69d40ae2464c2c63c4a))
* migrate tenant databases as the database admin ([364e2f9](https://github.com/pimabill/billing/commit/364e2f9926b67f91f5aa72ab543789b6e1946ba1))
* one broken tenant database no longer keeps the API down ([5adc6d0](https://github.com/pimabill/billing/commit/5adc6d00160421c1e08abc9009720baa2db2a2ae))
* one broken tenant database no longer keeps the API down ([23a5ef6](https://github.com/pimabill/billing/commit/23a5ef67fd8dd2cf50d775d456d61b2647ddf42a))
* **payments:** verify every payment notification before settling ([43ef528](https://github.com/pimabill/billing/commit/43ef5287b65bff3a4164995788babb05d882e7bf))
* **paypal:** remove redundant application_context causing every checkout to 422 ([243f5e9](https://github.com/pimabill/billing/commit/243f5e932f9ba487cfbe19ffb497387a82ab852a))
* **paypal:** remove redundant application_context causing every checkout to 422 ([df58681](https://github.com/pimabill/billing/commit/df586815e5ce24c7d675e013f87eb221fd700c12))
* Pesapal checkout 'Invalid IPN URL ID' by supporting ipnId credential ([de4aae3](https://github.com/pimabill/billing/commit/de4aae3fccd9893761b36840eaf4cc21d14ad346))
* regenerate backend/package-lock.json to resolve CI npm ci failure ([82f040a](https://github.com/pimabill/billing/commit/82f040a68dd791fddb1833eabbd9a5f94eaeeb79))
* resolve Pesapal transaction amount limit error ([1199674](https://github.com/pimabill/billing/commit/11996743a510533d011895a10811b972356c3d13))
* **sandbox:** no cloud plans in the sandbox ([#130](https://github.com/pimabill/billing/issues/130)) ([c730c8a](https://github.com/pimabill/billing/commit/c730c8aa15bb5cb2e5e17c4996c477902da42dec))
* **sdk:** one bearer token, positional ids, binary invoice PDF ([09ba8aa](https://github.com/pimabill/billing/commit/09ba8aa9a44955621ed2aff0a7c44c37e2b99528))
* **security:** block SSRF, encrypt with AES-GCM, run each cron once ([948df5f](https://github.com/pimabill/billing/commit/948df5f9aaac78d98ac0e40e0939d8a3af8e2a26))
* **security:** patch vulnerable dependencies, least-privilege workflows, and a stricter plain-text email ([#142](https://github.com/pimabill/billing/issues/142)) ([d7ccc32](https://github.com/pimabill/billing/commit/d7ccc327ee42ce2774db4c9d557d9f87fa4598c3))
* ship the brand fonts with the apps instead of fetching them at build time ([59d50d4](https://github.com/pimabill/billing/commit/59d50d4a7c2afe6dda67f170746e7a6f0f67cc73))
* ship the brand fonts with the apps instead of fetching them at build time ([2815d94](https://github.com/pimabill/billing/commit/2815d94e53159ca373471827bc795dd9f042c58a))
* **webhooks:** keep looking when a shared provider account is not this tenant's ([d89d847](https://github.com/pimabill/billing/commit/d89d8477d918fead2b6443e83f2ae38f488af993))
* **webhooks:** keep looking when a shared provider account is not this tenant's ([579d01d](https://github.com/pimabill/billing/commit/579d01d402ffda06288c0e1158e11fff5bb57812))
* write the brand as PimaBill in the wordmark, not lowercase ([f54fce9](https://github.com/pimabill/billing/commit/f54fce9798576939480c2b38fa1bafde717c58c2))
