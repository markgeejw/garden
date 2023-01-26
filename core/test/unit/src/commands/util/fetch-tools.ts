/*
 * Copyright (C) 2018-2022 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { exec, getPlatform, getArchitecture } from "../../../../../src/util/util"
import { createProjectConfig, makeTempDir, TempDirectory, TestGarden, withDefaultGlobalOpts } from "../../../../helpers"
import { FetchToolsCommand } from "../../../../../src/commands/util/fetch-tools"
import { expect } from "chai"
import { GARDEN_GLOBAL_PATH } from "../../../../../src/constants"
import { createGardenPlugin } from "../../../../../src/plugin/plugin"
import { join } from "path"

describe("FetchToolsCommand", () => {
  let tmpDir: TempDirectory

  const plugin = createGardenPlugin({
    name: "test",
    dependencies: [],
    tools: [
      {
        name: "tool-a",
        description: "foo",
        type: "binary",
        _includeInGardenImage: true,
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "https://raw.githubusercontent.com/garden-io/garden/v0.11.14/.editorconfig",
            sha256: "11f041ba6de46f9f4816afce861f0832e12ede015933f3580d0f6322d3906972",
          },
        ],
      },
      {
        name: "tool-b",
        description: "foo",
        type: "binary",
        _includeInGardenImage: false,
        builds: [
          {
            platform: getPlatform(),
            architecture: getArchitecture(),
            url: "https://raw.githubusercontent.com/garden-io/garden/v0.12.3/.dockerignore",
            sha256: "39d86a6cd966898b56f9ac5c701055287433db6418694fc2d95f04ac05817881",
          },
        ],
      },
    ],
  })

  const expectedPathA = join(GARDEN_GLOBAL_PATH, "tools", "tool-a", "058921ab05f721bb", ".editorconfig")
  const expectedPathB = join(GARDEN_GLOBAL_PATH, "tools", "tool-b", "a8601675b580d777", ".dockerignore")

  before(async () => {
    tmpDir = await makeTempDir()
    await exec("git", ["init", "--initial-branch=main"], { cwd: tmpDir.path })
  })

  it("should fetch tools for configured providers", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: createProjectConfig({
        path: tmpDir.path,
        providers: [{ name: "test" }],
      }),
    })

    garden.providerConfigs = [{ name: "test" }]
    garden.registeredPlugins = [plugin]

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "all": false, "garden-image-build": false }),
    })

    expect(result).to.eql({
      result: {
        "test.tool-a": {
          type: "binary",
          path: expectedPathA,
        },
        "test.tool-b": {
          type: "binary",
          path: expectedPathB,
        },
      },
    })
  })

  it("should fetch no tools when no providers are configured", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: createProjectConfig({
        path: tmpDir.path,
        providers: [{ name: "test" }],
      }),
    })

    garden.providerConfigs = []
    garden.registeredPlugins = [plugin]

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "all": false, "garden-image-build": false }),
    })

    expect(result).to.eql({
      result: {},
    })
  })

  it("should fetch tools for all providers with --all", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: createProjectConfig({
        path: tmpDir.path,
      }),
    })

    garden.providerConfigs = []
    garden.registeredPlugins = [plugin]

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "all": true, "garden-image-build": false }),
    })

    expect(result).to.eql({
      result: {
        "test.tool-a": {
          type: "binary",
          path: expectedPathA,
        },
        "test.tool-b": {
          type: "binary",
          path: expectedPathB,
        },
      },
    })
  })

  it("should fetch only tools marked for pre-fetch when --garden-image-build is set", async () => {
    const garden: any = await TestGarden.factory(tmpDir.path, {
      plugins: [plugin],
      config: createProjectConfig({
        path: tmpDir.path,
      }),
    })

    garden.providerConfigs = []
    garden.registeredPlugins = [plugin]

    await garden.resolveProviders(garden.log)

    const log = garden.log
    const command = new FetchToolsCommand()

    const result = await command.action({
      garden,
      log,
      headerLog: log,
      footerLog: log,
      args: {},
      opts: withDefaultGlobalOpts({ "all": true, "garden-image-build": true }),
    })

    expect(result).to.eql({
      result: {
        "test.tool-a": {
          type: "binary",
          path: expectedPathA,
        },
      },
    })
  })
})
