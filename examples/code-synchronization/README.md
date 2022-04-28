# Hot-reload example project

This example showcases Garden's code synchronization functionality.

You can synchronize your code (and other files) to and from running containers using dev mode.

## Structure of this project

This project contains a single service called `node-service`. When running, the service waits for requests on `/hello` and responds with a message.

In the `garden.yml` file of the `node-service` module we configure `devMode` and specify the target and source directories:

```yaml
# ...
devMode:
  sync:
    - source: src
      target: /app/src
      # Make sure to specify any paths that should not be synced!
      exclude: [node_modules]
      mode: one-way
# ...
```

We also tell the module which command should be run if dev mode is enabled to start the service:

```yaml
# ...
hotReloadArgs: [npm, run, dev]
# ...
```

## Usage

Just run the dev mode :)

```sh
garden dev
```

Our service is now up and running. We can send the service a simple GET request using `garden call`:

```sh
garden call node-service
```

Which will return a friendly greeting (Garden is friendly by default):

```sh
✔ Sending HTTP GET request to http://hot-reload.local.app.garden/hello

200 OK

{
  "message": "Hello from Node!"
}
```

Now go into [node-service/src/app.js](node-service/src/app.js) and change the message to something different. If you look at the console, you will see Garden updated the service very quickly, without rebuilding the container:

```sh
ℹ node-service              → Syncing src to /app/src in Deployment/node-service
```

And you can verify the change by running `garden call node-service` again:

```sh
✔ Sending HTTP GET request to http://hot-reload.local.app.garden/hello

200 OK

{
  "message": "Hello from Fortran!"
}
```

Check out the [docs](https://docs.garden.io/guides/code-synchronization-dev-mode) for more information on dev mode and code synchronization.