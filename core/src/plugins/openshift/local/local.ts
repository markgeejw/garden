/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { configureProvider, configSchema } from "./config"
import { createGardenPlugin } from "../../../plugin/plugin"

export const gardenPlugin = () =>
  createGardenPlugin({
    name: "local-openshift",
    base: "openshift",
    configSchema: configSchema(),
    handlers: {
      configureProvider,
    },
  })
