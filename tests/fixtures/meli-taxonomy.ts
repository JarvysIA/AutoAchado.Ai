export const TEST_ROOT_ID = "MLB5672";
export const TEST_PARENT_ID = "MLB900000001";
export const TEST_LEAF_ID = "MLB900000002";
export const TEST_OTHER_LEAF_ID = "MLB900000003";

export function validAutomotiveDump(): unknown {
  return [
    {
      id: TEST_ROOT_ID,
      name: "Acessórios para Veículos",
      path_from_root: [{ id: TEST_ROOT_ID, name: "Acessórios para Veículos" }],
      children_categories: [
        {
          id: TEST_PARENT_ID,
          name: "Categoria Sintética de Teste",
          path_from_root: [
            { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
            { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
          ],
          children_categories: [
            {
              id: TEST_LEAF_ID,
              name: "Leaf Sintética de Teste",
              extra_ignored_field: true,
              path_from_root: [
                { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
                { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
                { id: TEST_LEAF_ID, name: "Leaf Sintética de Teste" },
              ],
              children_categories: [],
            },
          ],
        },
        {
          id: TEST_OTHER_LEAF_ID,
          name: "Outra Leaf Sintética",
          path_from_root: [
            { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
            { id: TEST_OTHER_LEAF_ID, name: "Outra Leaf Sintética" },
          ],
          children_categories: [],
        },
      ],
    },
  ];
}

export function validAutomotiveObjectMap(): Record<string, unknown> {
  return {
    [TEST_ROOT_ID]: {
      id: TEST_ROOT_ID,
      name: "Acessórios para Veículos",
      path_from_root: [{ id: TEST_ROOT_ID, name: "Acessórios para Veículos" }],
      children_categories: [
        { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste", total_items_in_this_category: 2 },
        { id: TEST_OTHER_LEAF_ID, name: "Outra Leaf Sintética", total_items_in_this_category: 1 },
      ],
      settings: { synthetic_fixture: true },
    },
    [TEST_PARENT_ID]: {
      id: TEST_PARENT_ID,
      name: "Categoria Sintética de Teste",
      path_from_root: [
        { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
        { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
      ],
      children_categories: [
        { id: TEST_LEAF_ID, name: "Leaf Sintética de Teste", total_items_in_this_category: 1 },
      ],
      translations: { synthetic_fixture: true },
    },
    [TEST_LEAF_ID]: {
      id: TEST_LEAF_ID,
      name: "Leaf Sintética de Teste",
      path_from_root: [
        { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
        { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
        { id: TEST_LEAF_ID, name: "Leaf Sintética de Teste" },
      ],
      children_categories: [],
      extra_ignored_field: true,
    },
    [TEST_OTHER_LEAF_ID]: {
      id: TEST_OTHER_LEAF_ID,
      name: "Outra Leaf Sintética",
      path_from_root: [
        { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
        { id: TEST_OTHER_LEAF_ID, name: "Outra Leaf Sintética" },
      ],
      children_categories: [],
    },
  };
}

export const siteCategoriesPayload = [
  { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
];

export const categoryDetailPayload = {
  id: TEST_PARENT_ID,
  name: "Categoria Sintética de Teste",
  path_from_root: [
    { id: TEST_ROOT_ID, name: "Acessórios para Veículos" },
    { id: TEST_PARENT_ID, name: "Categoria Sintética de Teste" },
  ],
  children_categories: [{ id: TEST_LEAF_ID, name: "Leaf Sintética de Teste" }],
};
