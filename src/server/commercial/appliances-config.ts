// IDs verified against the official MLB5726 tree; ancestry is rechecked during discovery.
export const APPLIANCES_CONFIG={root:'MLB5726',capacity:100,typeLimit:4,familyLimit:25,version:'APPLIANCES_V1'} as const;
export const APPLIANCES_CATEGORIES=[
  {
    "id": "MLB456043",
    "name": "Fritadeiras",
    "family": "cozimento",
    "match": "fritadeira|air.?fryer"
  },
  {
    "id": "MLB120373",
    "name": "Panela de Arroz",
    "family": "cozimento",
    "match": "panela.*arroz"
  },
  {
    "id": "MLB48666",
    "name": "Panelas Elétricas",
    "family": "cozimento",
    "match": "panela"
  },
  {
    "id": "MLB48773",
    "name": "Panela a Vapor",
    "family": "cozimento",
    "match": "panela|cozedor"
  },
  {
    "id": "MLB31683",
    "name": "Sanduicheiras",
    "family": "cozimento",
    "match": "sanduicheira|grill"
  },
  {
    "id": "MLB31675",
    "name": "Torradeiras",
    "family": "cozimento",
    "match": "torradeira"
  },
  {
    "id": "MLB48730",
    "name": "Churrasqueiras Elétricas",
    "family": "cozimento",
    "match": "churrasqueira|grill"
  },
  {
    "id": "MLB120314",
    "name": "Fornos",
    "family": "cozimento",
    "match": "forno"
  },
  {
    "id": "MLB73057",
    "name": "Micro-ondas",
    "family": "cozimento",
    "match": "micro.?ondas"
  },
  {
    "id": "MLB73055",
    "name": "Liquidificadores",
    "family": "preparo",
    "match": "liquidificador"
  },
  {
    "id": "MLB4339",
    "name": "Batedeiras",
    "family": "preparo",
    "match": "batedeira"
  },
  {
    "id": "MLB263570",
    "name": "Mixers",
    "family": "preparo",
    "match": "mixer"
  },
  {
    "id": "MLB31674",
    "name": "Processadores",
    "family": "preparo",
    "match": "processador|triturador"
  },
  {
    "id": "MLB120446",
    "name": "Espremedores Elétricos",
    "family": "preparo",
    "match": "espremedor"
  },
  {
    "id": "MLB120445",
    "name": "Centrífuga de Frutas",
    "family": "preparo",
    "match": "centrifuga|extrator"
  },
  {
    "id": "MLB30220",
    "name": "Balanças de Cozinha",
    "family": "preparo",
    "match": "balanca"
  },
  {
    "id": "MLB429600",
    "name": "Moedores de Carne Elétricos",
    "family": "preparo",
    "match": "moedor"
  },
  {
    "id": "MLB9188",
    "name": "Cafeteiras",
    "family": "cafe",
    "match": "cafeteira"
  },
  {
    "id": "MLB31678",
    "name": "Chaleiras Elétricas",
    "family": "cafe",
    "match": "chaleira"
  },
  {
    "id": "MLB456055",
    "name": "Moedores de Café Elétricos",
    "family": "cafe",
    "match": "moedor"
  },
  {
    "id": "MLB455549",
    "name": "Espumadores de Leite",
    "family": "cafe",
    "match": "espumador|mixer|batedor"
  },
  {
    "id": "MLB421823",
    "name": "Marmitas Elétricas",
    "family": "cafe",
    "match": "marmita"
  },
  {
    "id": "MLB4337",
    "name": "Aspiradores",
    "family": "limpeza",
    "match": "aspirador|extratora|higienizadora"
  },
  {
    "id": "MLB120262",
    "name": "Robôs Aspiradores",
    "family": "limpeza",
    "match": "robo.*aspirador|aspirador.*robo"
  },
  {
    "id": "MLB73068",
    "name": "Vassouras Elétricas",
    "family": "limpeza",
    "match": "vassoura|aspirador"
  },
  {
    "id": "MLB31689",
    "name": "Ferro de Passar",
    "family": "roupas",
    "match": "ferro.*passar"
  },
  {
    "id": "MLB73062",
    "name": "Vaporizador",
    "family": "roupas",
    "match": "vaporizador|passadeira"
  },
  {
    "id": "MLB120307",
    "name": "Máquina de Costura",
    "family": "roupas",
    "match": "maquina.*costura"
  },
  {
    "id": "MLB1645",
    "name": "Ventiladores",
    "family": "clima",
    "match": "ventilador"
  },
  {
    "id": "MLB457530",
    "name": "Ventiladores Portáteis",
    "family": "clima",
    "match": "ventilador"
  },
  {
    "id": "MLB72503",
    "name": "Climatizador Portátil",
    "family": "clima",
    "match": "climatizador"
  },
  {
    "id": "MLB180081",
    "name": "Desumidificador",
    "family": "clima",
    "match": "desumidificador"
  },
  {
    "id": "MLB133297",
    "name": "Aquecedores de Ar",
    "family": "clima",
    "match": "aquecedor"
  },
  {
    "id": "MLB120242",
    "name": "Pipoqueiras Elétricas",
    "family": "especialidades",
    "match": "pipoqueira"
  },
  {
    "id": "MLB120243",
    "name": "Máquinas de Waffles",
    "family": "especialidades",
    "match": "waffle"
  },
  {
    "id": "MLB457810",
    "name": "Omeleteiras",
    "family": "especialidades",
    "match": "omeleteira"
  },
  {
    "id": "MLB62076",
    "name": "Panificadoras",
    "family": "especialidades",
    "match": "panificadora|maquina.*pao"
  },
  {
    "id": "MLB120244",
    "name": "Iogurteiras",
    "family": "especialidades",
    "match": "iogurteira"
  },
  {
    "id": "MLB120246",
    "name": "Sorveteiras",
    "family": "especialidades",
    "match": "sorveteira"
  },
  {
    "id": "MLB76475",
    "name": "Frigobares",
    "family": "refrigeracao",
    "match": "frigobar"
  },
  {
    "id": "MLB76481",
    "name": "Adegas Climatizadas",
    "family": "refrigeracao",
    "match": "adega"
  },
  {
    "id": "MLB181287",
    "name": "Cervejeiras",
    "family": "refrigeracao",
    "match": "cervejeira"
  }
] as const;
