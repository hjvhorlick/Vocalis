/**
 * Regression inventory of the existing preset personalities.  The digest covers
 * all user-facing personality/source fields, but deliberately excludes immutable
 * protection metadata added by the variant system. Updating an existing persona
 * must be an explicit, reviewed product decision.
 */
export const ORIGINAL_PERSONALITY_SHA256: Readonly<Record<string, string>> = Object.freeze({
  'voice-slt-aria': 'dde12dac1ed1cec6b057b75f775082f5b89549fb730d16b6737035deee11b456', 'voice-rms-marcus': 'f4ac57d996cb44b58f975f5398ea9bab1d4add95c26f78c51fd18027447e123d',
  'voice-awb-oliver': 'faa46554d9d5b142903ab8af7c7809a74a4fa1e34817c072fae4117ef024e0f7', 'voice-clb-charlotte': 'c464f20ddcda78d6ffd603420144473861cd105cf207ab04c715660364604242',
  'voice-bdl-david': '64411e70af755c725f047b171bd08a092ff0eb90c88cd9d4674d11843dee86ac', 'voice-jmk-john': 'b48d0b8cb8f329ec9ea19eb0cd43c8d85537beb7534b3994ef732e79d99140d3',
  'voice-ksp-dev': '2d506edcbf8109920b84f0708a79f6ef69a4e8f0b8acb54d0787dd737be5e243', 'voice-osr-elena': '8c1df10ddd00073cc7208cb79107a6e3c70a61473102cfc53e2940c10beea36a',
  'voice-osr-michael': '1f2c483ca2b1d6a4c035f19688fe4c16377983b1bf0dbb42b563e86d08cf4b73', 'voice-osr-alistair': '59c9abc05ef4dc4690be451ba8b63e1d610ee73b1d05ceeb20259fe0bc527d0d',
  'voice-osr-rupert': '1eb4ca3c9cd2470efdc15e136f3e5288575baac1465d5a0fbd2c096fe7e4853c', 'voice-osr-victoria': '1d16e5f6d20a189885902fb3d2b7c59e59e60ce7780c469becac6b5ec5c81906',
  'voice-slt-willow': '20eb6b8ce4a26f94b7704820fc8995a6b807bcc3fe62eaa871359e45dded1d87', 'voice-rms-garrison': '0c155ef96685150be8ab1fdc04a5f8088113739cee25b827a81971770cf225a0',
  'voice-awb-hamish': '03372386a0512d762e050fc81c8094ff7e9025e1b45b8e6bc955c862c9e33572', 'voice-clb-beatrice': '85144afabed06b321d7157dcb5b823a59e45b02ef3652e5f027a043daeb4fe42',
  'voice-bdl-sterling': '479bd72b3fbeb2d1d8151175b8fbb8744ead1dc2a59cd93b12f79885c26aa8d6', 'voice-jmk-liam': 'f9931f8a2840775de989253f9c7905a0a91667dc686149bcc40e467bbed1ea8f',
  'voice-ksp-rajesh': 'ff778c1d7bcf71b99400c47f875dfc984e91a7177e98d1b16f5950e928a7812b', 'voice-cmu-fiona': '3824b49b8184d43ea2bd18c67b3c8584c2be17ce215df7983f9ebdb3775bdf05',
  'voice-cmu-alexander': '687a4fbaed5a95365c5be6336c9a5b6da079804b5bbf35bcf7f68204b8d5ce12', 'voice-cmu-hans': '2bb43dea21ae4440f62252c480fd082eb7544abfce0409b9be44229001f24dbd',
  'voice-cmu-arjun': 'f0da19f717914c639e9395acc985cbd35a5d8d003ada891692b232bc78f955f1', 'voice-cmu-ananya': 'af38845c1035efed8bc6c55e0dcdc10ffcedeafe9e3ce017ff3610ed9975eaa2',
  'voice-cmu-ethan': '51d27c5281ee3379360976b9d5f2e4d5850c3ea1c3995b4118cd9575564142b4', 'voice-cmu-gaurav': 'fbad858c8ce1b28c7b25436cbe759fd4d35ec7616a62adfc27a20cfae42b2fb1',
  'voice-cmu-lauren': '9106da69771d2d48efd53eed01ba8edcf2fe9638a8bcb3464d3645b12ffaabd7', 'voice-cmu-nora': '886707390f20d99d2f667ec40568383615328fe8dccf7cc17dc464a869e79c05',
  'voice-cmu-priya': 'cd2d17056b9b7b395b2c9028a4abccdc4075bedfb65475e7358dab5c35bc9f8f', 'voice-cmu-rowan': 'aed63617591b242147869c72c4cb6c254e0f7fd53f443204288ec69c8e387965',
  'voice-osr-arthur': 'c8cdd45bc06244a8d2f02926ed44e75437c7cd9a015eef89a23a4c43ba532e2a', 'voice-osr-oliver2': '6618ea6b43cb939035dce3c5bf6c0cc3865a983d1eb49eee1b30b45707155c4b',
  'voice-osr-gwendolyn': 'b170e8c4fdb5239f2738a9afacf65a994cf5a41182f59e534ac64c8b8a48baaf', 'voice-osr-penelope': '9e8e4825a2c78dca52426d7a95d5d5b89dec540603185adf0083b126f5081093',
  'voice-osr-seraphina': 'a8bf30831f4309b984fb85db7127c06846397cd5e898345e00796b2776a25de4', 'voice-osr-madeline': 'f825aa9d70bcaf19e495bfffcd27ef385efdc1fb510bba1105b6ce344775c435',
  'voice-osr-harrison': '9ae8deb841185e4af9dbafa3c39c907ec9f521f7c6a12d321d0e5190a45e48f5', 'voice-osr-vikram': 'e39bca1a35dea9bcf1816cb4d82c5696b023f1e43dd64afe2e01073507a47c4e',
  'voice-osr-etienne': 'a2b2a252414ff211fade04d12429dc913a3adb5252968db30605a0e3a737fa6e', 'voice-cmu-fiona-2': '91c81183d883e6ebf35a17550253aa953810fea747e71b4779eaa37fe44c4fc6',
  'voice-cmu-alexander-2': '7f8ed55b3eb542a96751f09bb5402efa2b7c8dad932ee9dcd49fe3f93198ac95', 'voice-cmu-hans-2': 'e8253dd3280a3930f8adc36d9a465a2750954fa7452e88753db58a7dc7cb5879',
  'voice-cmu-arjun-2': '79fcdf1c5fc14a93dff7a91ecb25a5fb94a4a894e75269cde45d73167fc9e7c2', 'voice-cmu-ananya-2': 'eabcc946e2f8d39176a8d03e005525957486db4cd82f9981a67a71bbd940781e',
  'voice-cmu-ethan-2': '6411032372c44d96bec35fc1669d1eb316bcb40032b42aebba3438d7d8924521', 'voice-cmu-gaurav-2': '56cf2fd02066a39bd7c969b6ab4661edbbdf16eef5514c6818baac4da102c314',
  'voice-cmu-lauren-2': 'e94e879f3b3d0e9fdf966b4d252d3936390ae7e541053a74bffd22c9fe61dfaf', 'voice-cmu-nora-2': '873a998cf23014537b0133a4f8e9768401c05350346537213298032be83964bd',
  'voice-cmu-priya-2': '6f14c63d1ca82e332a9d438f56dc71905f654c801a540d45c3d0df25c1c150f7',
  'voice-cmu-rowan-2': '9f1f3b0515ae13701279ce9e10fda0990ce7976ec1880af44222bf4cc547d955',
  'voice-cmu-hamish-2': 'f2cf98e56935d39df9f73f96229a6a82e2e5335478abb4bd2912023b747cf670',
  'voice-cmu-liam-2': 'a3ad71034a46e193fdb2b41dee66fa1e9ac4607248eb720d63184c16975e5d12', 'voice-cmu-rajesh-2': '35af2251ae8703840e042dc91e329583f33f84008162d5e00953c23275129e29',
  'voice-osr-sebastian': 'ac79f4366f99db754e16418e281968d51975e96b05f3d2ac689ce42be199e756', 'voice-osr-julian': 'b6c54776ecb6c9f87eba9344bacacfa5274fd9e45c0be07dfd35b73b2f919126',
  'voice-osr-eleanor': 'cc6af3dfcb71023a5abd491cb952f93cb63143b1082a204a73b967b0065d9e5f', 'voice-osr-beatrice-2': '2ee801ea630b192023d46fec692fea9bf2ff4fec53bdd39e387c3f7f8e576d49',
  'voice-osr-clara': '6209e88403b765dc03753d0eaa99795d02fafa28ddf7fc1fa8eada5a79fe245a', 'voice-osr-hannah': '1b61ee831587b910cfaf2f31bff58dc2454b075d7b6db6cd636bdcdba7fc1d98',
  'voice-osr-daniel': '03141e032970a7091022cfa440960cab174da2932fcbc230e81fd21afbc6f0c7',
});
