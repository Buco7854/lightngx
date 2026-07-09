// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  guide: [
    "index",
    "screenshots",
    {
      type: "category",
      label: "Setup",
      collapsible: false,
      items: [
        "requirements",
        "setups",
        "light",
        "full",
        "hardened",
        "without-docker",
      ],
    },
    {
      type: "category",
      label: "Guide",
      collapsible: false,
      items: ["sites", "accounts", "api-keys"],
    },
    {
      type: "category",
      label: "Reference",
      collapsible: false,
      items: ["configuration", "security", "development"],
    },
  ],
};

module.exports = sidebars;
