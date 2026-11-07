# The self-hosting installer. Build from the repository root.
FROM docker:27.5.1-cli
RUN apk add --no-cache openssl
COPY installer/pimabill installer/docker-compose.yml version.txt /opt/pimabill/
ENTRYPOINT ["/opt/pimabill/pimabill"]
CMD ["install"]
