// src/lib/translation/models.js
// The translation models used for each language, pinned to an exact Hugging
// Face revision with the SHA-256 of every file. The first entry for a
// language is used; the next one is a fallback if the first cannot be
// downloaded or loaded.
//
//  - es, fr, pt, ru: OPUS-MT "transformer-big" models by the University of
//    Helsinki (Tatoeba Challenge). Russian comes from the East Slavic model.
//  - de: the same University of Helsinki transformer-big eng-deu model
//    (opusTCv20210807+bt-2021-12-08), converted for Hugging Face.
//  - fallbacks: the smaller original OPUS-MT models by the same group, at the
//    revision where Hugging Face added their safetensors weights.
// All models are licensed CC-BY 4.0 or Apache 2.0.

export const MODELS = {
  es: [
    {
      repo: "Helsinki-NLP/opus-mt-tc-big-en-es",
      revision: "8f4d4924189681076e9c642b2fd85278d793fd4d",
      targetToken: null,
      files: {
        "config.json": { size: 1076, sha256: "40cf2a78774927cd8374514a73c96a3fc2285748fae1bcdfe197e1dc1cc54692" },
        "generation_config.json": { size: 301, sha256: "8f8c2aeb22e87bcb1ea19cb206f4d9341d178574ab41778ab104ee7cf8db8379" },
        "vocab.json": { size: 1378022, sha256: "ee2728c5deb7c2dbe255df52b02b45285fda8a7c4dafc236e6d2af5dbeab5a36" },
        "source.spm": { size: 804235, sha256: "b1763341d3a71262ed5aacc3f8287d3c3c2f2ae82295e11d03aea80879c98009" },
        "target.spm": { size: 824118, sha256: "c70086dcac73d9c759cca0b5f195a073033906dcd29433d6c5fe74e66b2cc8da" },
        "model.safetensors": { size: 465549630, sha256: "1cc0d454aed713ccd07b4cb7801f08f72c1f885c79c6fd76d2b0d99ea0d3cd2b" }
      }
    },
    {
      repo: "Helsinki-NLP/opus-mt-en-es",
      revision: "fdaddf76f50fcc1583ba42f95965862a7ab30f97",
      targetToken: null,
      files: {
        "config.json": { size: 1473, sha256: "666ad3c2943674b6a789e311d221e44ec23e27f1bd9727930754bf773ec8e464" },
        "generation_config.json": { size: 293, sha256: "837839ed0534a27084f9b980fc33f47729052dd89cb26cca7ac830765ed30e49" },
        "vocab.json": { size: 1590040, sha256: "257f346d7a6b2ecceafcca8ba05648ce2fd68dfaf105fb0e913dca7198f3f6d5" },
        "source.spm": { size: 801636, sha256: "4dd547c24816a335e7b0b2e63376a8f1b3cbfc671eda5ab808dd44fdadaa8791" },
        "target.spm": { size: 825924, sha256: "e236ee6d866b635c0142114f8647f39831f9d92534aa2aad75c942f6a78ad0e3" },
        "model.safetensors": { size: 312062468, sha256: "b3ecbf954573c2fd95d05d3ad4618baf961793db0da07c2add2e8a3a6cd78d0b" }
      }
    }
  ],
  pt: [
    {
      repo: "Helsinki-NLP/opus-mt-tc-big-en-pt",
      revision: "9f2863d807ecf91a374bdbecb8d01e402e90622e",
      targetToken: ">>pob<<",
      files: {
        "config.json": { size: 1076, sha256: "ca76b1818f066007e94fb2519c0752320cee36a5d4947bf7ef4477c845feacc5" },
        "generation_config.json": { size: 301, sha256: "0cf63469feb877c42fee042a5e9f429117297abee3d5641a4c347fec09597126" },
        "vocab.json": { size: 1380764, sha256: "dad10ad0acbf34ad92af16cb37fd71732d2b73851274698d58c5439386b506a1" },
        "source.spm": { size: 802741, sha256: "7a7fcf812cf03a5785daa35d4932bbbe69e7e605c0fe56fce5a3f731d6c355aa" },
        "target.spm": { size: 824855, sha256: "b3cf20ccd4e48a89882cfdba157c05fa1cd71a6b69517dfc80e3a34d387ea91f" },
        "model.safetensors": { size: 465035080, sha256: "f1772ec97f6cb5b942bb6a5555a04272960a228a523f7ed47e24014236aa1716" }
      }
    },
    {
      repo: "Helsinki-NLP/opus-mt-en-ROMANCE",
      revision: "b20efd9837bd3779d6306ad15f053e819db31f83",
      targetToken: ">>pt_br<<",
      files: {
        "config.json": { size: 1403, sha256: "bcae8ed74fed77fb51c58462b62397fee6b1a1a34aece79183a0dd02ad329e71" },
        "generation_config.json": { size: 293, sha256: "837839ed0534a27084f9b980fc33f47729052dd89cb26cca7ac830765ed30e49" },
        "vocab.json": { size: 1457360, sha256: "f2ce5a92734a7859cb4e91dc9ccd823e4a71585efbe4bbfe25e96e3d4bf48f34" },
        "source.spm": { size: 779155, sha256: "b1f89e7b05828846baf19109a61029a36838f1c4f3defc218e6aee0ee2787864" },
        "target.spm": { size: 799001, sha256: "5e54632fe5ce5ef4108a827daccc121b7cd4ea589fbb4bd856b8dd06086166b2" },
        "model.safetensors": { size: 312062580, sha256: "e603d2220b47dd7ea7e3bb534b0e58b84122ebd6432809d0a85fefa973893370" }
      }
    }
  ],
  fr: [
    {
      repo: "Helsinki-NLP/opus-mt-tc-big-en-fr",
      revision: "6e062862ced6f5622a589ab2aadc2a1d4978db78",
      targetToken: null,
      files: {
        "config.json": { size: 1076, sha256: "ac35de27c1645637a46d3b2f41052365ef52a7c23e169719629381f6b1fb025c" },
        "generation_config.json": { size: 301, sha256: "e08b63c58a6de96ea4275ac59681cefbf88663a10419e65e1510156061c43a88" },
        "vocab.json": { size: 1332010, sha256: "2994b7def69d6495d8f02369b57e3f04e2474f76ce64eda2921643e1f76fef41" },
        "source.spm": { size: 802408, sha256: "18bb5a422a53a0bd699b005c8086cbd58a85c4be427fd57ca687c958588edcc9" },
        "target.spm": { size: 819955, sha256: "6437b5600d2ae14888939e589773b09bc667c77e81326e20e3f57698a4078593" },
        "model.safetensors": { size: 461429130, sha256: "5c88b4f7a63934b8be72372b86661e616227c20be4b75612eeee7dca96494217" }
      }
    },
    {
      repo: "Helsinki-NLP/opus-mt-en-fr",
      revision: "c96fcd7f38a4c0d1ac9b61e255b47f3f7ff55e5e",
      targetToken: null,
      files: {
        "config.json": { size: 1416, sha256: "df92c371911b45282caac6101fe7e7f5d5e9af7f9a99356067ffe306278ce72b" },
        "generation_config.json": { size: 293, sha256: "4956fb9a7caaad7579cf8bb789c1e578b8a1cf48a0a8b779fda2f95dd10bbaa5" },
        "vocab.json": { size: 1339166, sha256: "945c604346ce15ce4aff9001001e7f925e336d942c4087017f191871162cbdc4" },
        "source.spm": { size: 778395, sha256: "173e9f493a668fe396d599e28d414a201193094e6ffd7a4678e5aab0f6d3d838" },
        "target.spm": { size: 802397, sha256: "78d0e717c77053f1c4b856d8661d9cb87c64f083a35418c087b9146300e4f585" },
        "model.safetensors": { size: 300803256, sha256: "c32d3003ced798c78b9ca90fb69c8e23ad5b4c64c500628bdf3303bbc9272816" }
      }
    }
  ],
  de: [
    {
      repo: "gsarti/opus-mt-tc-big-en-de",
      revision: "c2dcc36fd4e878b6fa9d7652c98f39c73dca27a1",
      targetToken: null,
      files: {
        "config.json": { size: 1068, sha256: "ce9ab042435c78b2a44f03fddecef0e2c5735a438c770da855a90777bb56c907" },
        "vocab.json": { size: 1697908, sha256: "48965870075904f08e6ad5a2b32874c3dcf3f9b72b089e75ea81d1425516c007" },
        "source.spm": { size: 794463, sha256: "209a2bf269540755fc2a29491e57c963bc8c6c1d14dab9f0779cf1dc54fc7d8c" },
        "target.spm": { size: 818726, sha256: "44faa3234c2e663705f548e868d84d204530af95812b24f320a6d9ace9ae6482" },
        "pytorch_model.bin": { size: 619169923, sha256: "94ff3bc13fb7c6e175ced0ce952d1ec47f8d836fe70045c0f2e6cbc78e92bd53" }
      }
    },
    {
      repo: "Helsinki-NLP/opus-mt-en-de",
      revision: "0012d6d6ff4b4dd06bee042d3294295f0e587abd",
      targetToken: null,
      files: {
        "config.json": { size: 1335, sha256: "41c7890e6f6c1f72c5c626569cfe739a8362080940edbb1747f25173f541653b" },
        "generation_config.json": { size: 293, sha256: "e5cccf365761fb31175fc978a75f5e857a822f173d0e447aa3a25d7cbcda15a4" },
        "vocab.json": { size: 1273232, sha256: "0d70d89fee4a8b4ef99a56d712163baadcabd5600a597f71515547ee70306329" },
        "source.spm": { size: 768489, sha256: "678f2a1177d8389f67b66299762dcc4fc567e89b07e212ba91b0c56daecf47ce" },
        "target.spm": { size: 796845, sha256: "bbd1f495eea99c8e21ae086d9146e0fa7b096c3dfdd9ba07ab8b631889df5c9b" },
        "model.safetensors": { size: 297903668, sha256: "3fb78700bce624990eff6468d0e14fbde18a6aedac35821fa8c0c4ead5fae014" }
      }
    }
  ],
  ru: [
    {
      repo: "Helsinki-NLP/opus-mt-tc-big-en-zle",
      revision: "708be1d372fe4c358a352f404e6dc9ca0126ba48",
      targetToken: ">>rus<<",
      files: {
        "config.json": { size: 1076, sha256: "962d235879c9def4cfdf140be81436d4fb9da25271dd69079df2c90b459f1332" },
        "generation_config.json": { size: 301, sha256: "d851d84c804c745d92dae5659bd2d8e8b976b664dd0fbc39b82ee88340147802" },
        "vocab.json": { size: 2510527, sha256: "41dbdff4a0b5a6ab125715c3342c5ce6516e93ffd49608813240403f036c5efb" },
        "source.spm": { size: 802747, sha256: "3612abfe04bf08344ba91115f0e15e228a7a15a621ea856bfd548097dbaeb43c" },
        "target.spm": { size: 1017004, sha256: "22940e744b3a9fd166a04880938fb61f7dfa8ba4b5d2d3f6371a6c4ba8f3b019" },
        "model.safetensors": { size: 478977130, sha256: "e68caa9a233c177a3489257b69c18cece6da97767ab2581918ce3fc3c3899416" }
      }
    },
    {
      repo: "Helsinki-NLP/opus-mt-en-ru",
      revision: "3ff4dbd98515ba253f08f183e0de0b7ccf189ee3",
      targetToken: null,
      files: {
        "config.json": { size: 1381, sha256: "d3c2614fd099bc228fc257f047e46f1c6f94cfa12dee2b1fa6c0d780e6b7de06" },
        "generation_config.json": { size: 293, sha256: "152452cb7a96bff6c20b54f91fae2a655b72a8a9ce978ca3e9384f87253d5281" },
        "vocab.json": { size: 2601758, sha256: "33e95da3be3fa3b50169c4c46693ba2f29fbf4cb29d99044bd07d72d181fa1e9" },
        "source.spm": { size: 802781, sha256: "16bebef1389a0b8ab452772c4e35b9e605e5713f8ac7baa71ca701394eaa086d" },
        "target.spm": { size: 1080169, sha256: "745998e51ba5b058e38b7ac7765c25c43ed5c1c39cc92b27163b9b2e323c9d7c" },
        "model.safetensors": { size: 306967464, sha256: "07f5d90a45955a73412a118f0635315a28ea5a5d82522f3be008e71d452526c0" }
      }
    }
  ]
};

/** Short, stable identifier of a model candidate (stored with each translation). */
export function modelKey(candidate) {
  return `${candidate.repo}@${candidate.revision.slice(0, 12)}`;
}
