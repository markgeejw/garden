/*
 * Copyright (C) 2018-2023 Garden Technologies, Inc. <info@garden.io>
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

import { expect } from "chai"
import cloneDeep from "fast-copy"

import type { ConfigGraph } from "../../../../../../src/graph/config-graph.js"
import type { PluginContext } from "../../../../../../src/plugin-context.js"
import { getManifests } from "../../../../../../src/plugins/kubernetes/kubernetes-type/common.js"
import type { TestGarden } from "../../../../../helpers.js"
import { expectError, getDataDir, getExampleDir, makeTestGarden } from "../../../../../helpers.js"
import type { KubernetesDeployAction } from "../../../../../../src/plugins/kubernetes/kubernetes-type/config.js"
import type { Resolved } from "../../../../../../src/actions/types.js"
import { KubeApi } from "../../../../../../src/plugins/kubernetes/api.js"
import type { KubernetesProvider } from "../../../../../../src/plugins/kubernetes/config.js"
import dedent from "dedent"
import { dirname, join } from "path"
import { resolveMsg } from "../../../../../../src/logger/log-entry.js"

let kubernetesTestGarden: TestGarden

export async function getKubernetesTestGarden() {
  if (kubernetesTestGarden) {
    return kubernetesTestGarden
  }

  const projectRoot = getDataDir("test-projects", "kubernetes-type")
  const garden = await makeTestGarden(projectRoot)

  kubernetesTestGarden = garden

  return garden
}

describe("getManifests", () => {
  let garden: TestGarden
  let ctx: PluginContext
  let graph: ConfigGraph
  let api: KubeApi
  const defaultNamespace = "foobar"

  context("duplicates", () => {
    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("finds duplicates in manifests declared inline", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("duplicates-inline")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 1)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both inline and using kustomize", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("duplicates-inline-kustomize")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo generated by Kustomize at path ${join(
              dirname(action.configPath()!),
              "/k8s"
            )} (index: 0)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both inline and in files", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("duplicates-files-inline")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo declared in the file ${join(
              dirname(action.configPath()!),
              "/k8s/manifest.yaml"
            )} (index: 0)
            - Service silly-demo declared inline in the Garden configuration (filename: ${action.configPath()}, index: 0)
            `)
        }
      )
    })

    it("finds duplicates between manifests declared both using kustomize and in files", async () => {
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("duplicates-files-kustomize")),
        log: garden.log,
        graph,
      })

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.equal(dedent`
            Duplicate manifest definition: Service named silly-demo is declared more than once:

            - Service silly-demo generated by Kustomize at path ${join(
              dirname(action.configPath()!),
              "/k8s"
            )} (index: 0)
            - Service silly-demo declared in the file ${join(
              dirname(action.configPath()!),
              "/k8s/manifest.yaml"
            )} (index: 0)
            `)
        }
      )
    })
  })

  context("kustomize", () => {
    const exampleDir = getExampleDir("kustomize")

    let action: Resolved<KubernetesDeployAction>

    before(async () => {
      garden = await makeTestGarden(exampleDir)
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
      action = await garden.resolveAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("hello-world")),
        log: garden.log,
        graph,
      })
    })

    const expectedErr = "kustomize.extraArgs must not include any of -o, --output, -h, --help"

    it("throws if --output is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--output", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -o is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-o", "foo"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if -h is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["-h"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => expect(err.message).to.include(expectedErr)
      )
    })

    it("throws if --help is set in extraArgs", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--help"]

      await expectError(
        () => getManifests({ ctx, api, action, log: garden.log, defaultNamespace }),
        (err) => {
          expect(err.message).to.include(expectedErr)
        }
      )
    })

    it("runs kustomize build in the given path", async () => {
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      const kinds = result.map((r) => r.kind)
      // the last ConfigMap stands for internal metadata ConfigMap
      expect(kinds).to.have.members(["ConfigMap", "Service", "Deployment", "ConfigMap"])
    })

    it("adds extraArgs if specified to the build command", async () => {
      action["_config"].spec.kustomize!.extraArgs = ["--reorder", "none"]
      const result = await getManifests({ ctx, api, action, log: garden.log, defaultNamespace })
      const kinds = result.map((r) => r.kind)
      // the last ConfigMap stands for internal metadata ConfigMap
      expect(kinds).to.eql(["Deployment", "Service", "ConfigMap", "ConfigMap"])
    })
  })

  context("kubernetes manifest files resolution", () => {
    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("should support regular files paths", async () => {
      const executedAction = await garden.executeAction<KubernetesDeployAction>({
        action: cloneDeep(graph.getDeploy("with-build-action")),
        log: garden.log,
        graph,
      })
      // Pre-check to ensure that the test project has a correct default glob file pattern.
      expect(executedAction.getSpec().files).to.eql(["*.yaml"])

      const manifests = await getManifests({ ctx, api, action: executedAction, log: garden.log, defaultNamespace })
      expect(manifests).to.exist
      const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
      // Now `getManifests` also returns a ConfigMap with internal metadata
      expect(names).to.eql([
        { kind: "Deployment", name: "busybox-deployment" },
        {
          kind: "ConfigMap",
          name: "garden-meta-deploy-with-build-action",
        },
      ])
    })

    it("should support both regular paths and glob patterns with deduplication", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      // Append a valid filename that results to the default glob pattern '*.yaml'.
      action["_config"]["spec"]["files"].push("deployment.yaml")
      const executedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })
      // Pre-check to ensure that the list of files in the test project config is correct.
      expect(executedAction.getSpec().files).to.eql(["*.yaml", "deployment.yaml"])

      const manifests = await getManifests({ ctx, api, action: executedAction, log: garden.log, defaultNamespace })
      expect(manifests).to.exist
      const names = manifests.map((m) => ({ kind: m.kind, name: m.metadata?.name }))
      // Now `getManifests` also returns a ConfigMap with internal metadata
      expect(names).to.eql([
        { kind: "Deployment", name: "busybox-deployment" },
        {
          kind: "ConfigMap",
          name: "garden-meta-deploy-with-build-action",
        },
      ])
    })

    it("should throw on missing regular path", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      action["_config"]["spec"]["files"].push("missing-file.yaml")
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      await expectError(
        () =>
          getManifests({
            ctx,
            api,
            action: resolvedAction,
            log: garden.log,
            defaultNamespace,
          }),
        {
          contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
        }
      )
    })

    it("should throw when no files found from glob pattens", async () => {
      const action = cloneDeep(graph.getDeploy("with-build-action"))
      // Rewrite the whole files array to have a glob pattern that results to an empty list of files.
      action["_config"]["spec"]["files"] = ["./**/manifests/*.yaml"]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      await expectError(
        () =>
          getManifests({
            ctx,
            api,
            action: resolvedAction,
            log: garden.log,
            defaultNamespace,
          }),
        {
          contains: `Invalid manifest file path(s) declared in ${action.longDescription()}`,
        }
      )
    })
  })
  context("resource patches", () => {
    before(async () => {
      garden = await getKubernetesTestGarden()
      const provider = (await garden.resolveProvider(garden.log, "local-kubernetes")) as KubernetesProvider
      ctx = await garden.getPluginContext({ provider, templateContext: undefined, events: undefined })
      api = await KubeApi.factory(garden.log, ctx, provider)
    })

    beforeEach(async () => {
      graph = await garden.getConfigGraph({ log: garden.log, emit: false })
    })

    it("should apply patches to a manifest", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
              template: {
                spec: {
                  containers: [
                    {
                      name: "busybox",
                      env: [
                        {
                          name: "PATCH", // <--- This gets appended to the list when using the default 'strategic'
                          // merge strategy
                          value: "patch-val",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      expect(manifests[0].spec.template.spec.containers[0].env).to.eql([
        {
          name: "PATCH",
          value: "patch-val",
        },
        {
          name: "FOO",
          value: "banana",
        },
        {
          name: "BAR",
          value: "",
        },
        {
          name: "BAZ",
          value: null,
        },
      ])
      expect(manifests[0].spec.replicas).to.eql(3)
    })
    it("should handle multiple patches", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world",
            },
          },
        },
      ]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      expect(manifests[0].spec.replicas).to.eql(3)
      expect(manifests[1].data.hello).to.eql("patched-world")
    })
    it("should store patched version in metadata ConfigMap", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            metadata: {
              namespace: "patched-namespace-deployment",
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            metadata: {
              namespace: "patched-namespace-configmap",
            },
          },
        },
      ]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      const metadataConfigMap = manifests.filter((m) => m.metadata.name === "garden-meta-deploy-deploy-action")
      expect(JSON.parse(metadataConfigMap[0].data.manifestMetadata)).to.eql({
        "Deployment/busybox-deployment": {
          apiVersion: "apps/v1",
          key: "Deployment/busybox-deployment",
          kind: "Deployment",
          name: "busybox-deployment",
          namespace: "patched-namespace-deployment", // <--- The patched namespace should be used here
        },
        "ConfigMap/test-configmap": {
          apiVersion: "v1",
          key: "ConfigMap/test-configmap",
          kind: "ConfigMap",
          name: "test-configmap",
          namespace: "patched-namespace-configmap", // <--- The patched namespace should be used here
        },
      })
    })
    it("should apply patches to file and inline manifests", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["manifests"] = [
        {
          apiVersion: "v1",
          kind: "ConfigMap",
          metadata: {
            name: "test-configmap-inline",
          },
          data: {
            hello: "world-inline",
          },
        },
      ]
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
        {
          name: "test-configmap",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world",
            },
          },
        },
        {
          name: "test-configmap-inline",
          kind: "ConfigMap",
          patch: {
            data: {
              hello: "patched-world-inline",
            },
          },
        },
      ]
      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      expect(manifests[0].data.hello).to.eql("patched-world-inline")
      expect(manifests[1].spec.replicas).to.eql(3)
      expect(manifests[2].data.hello).to.eql("patched-world")
    })
    it("should apply patches BEFORE post processing manifests", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3, // <--- This should be set
            },
            metadata: {
              annotations: {
                "garden.io/service": "patched-service-annotation", // <--- This should not be set
                "garden.io/mode": "patched-mode",
              },
            },
          },
        },
      ]

      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      expect(manifests[0].spec.replicas).to.eql(3)
      // These annotations are set during manifest post processing and should stay intact
      expect(manifests[0].metadata.annotations).to.eql({
        "garden.io/service": "deploy-action",
        "garden.io/mode": "default",
      })
    })
    it("should allow the user to configure the merge patch strategy", async () => {
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "busybox-deployment",
          kind: "Deployment",
          strategy: "merge",
          patch: {
            spec: {
              replicas: 3,
              template: {
                spec: {
                  containers: [
                    {
                      name: "busybox",
                      env: [
                        {
                          name: "PATCH", // <--- This overwrites the list when using the 'merge' strategy
                          value: "patch-val",
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      ]

      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      const manifests = await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      // Existing env values get replaced when using the 'merge' strategy
      expect(manifests[0].spec.template.spec.containers[0].env).to.eql([
        {
          name: "PATCH",
          value: "patch-val",
        },
      ])
      expect(manifests[0].spec.replicas).to.eql(3)
    })
    it("should log a warning if patches don't match manifests", async () => {
      garden.log.root["entries"] = []
      const action = cloneDeep(graph.getDeploy("deploy-action"))
      action["_config"]["spec"]["patchResources"] = [
        {
          name: "non-existent-resource",
          kind: "Deployment",
          patch: {
            spec: {
              replicas: 3,
            },
          },
        },
      ]

      const resolvedAction = await garden.resolveAction<KubernetesDeployAction>({
        action,
        log: garden.log,
        graph,
      })

      await getManifests({ ctx, api, action: resolvedAction, log: garden.log, defaultNamespace })

      const logEntries = garden.log.root.getLogEntries()
      const unMatched = resolveMsg(logEntries.find((entry) => resolveMsg(entry)?.includes("A patch is defined"))!)

      expect(unMatched).to.exist
      expect(unMatched).to.eql(
        `A patch is defined for a Kubernetes Deployment with name non-existent-resource but no Kubernetes resource with a corresponding kind and name found.`
      )
    })
  })
})
